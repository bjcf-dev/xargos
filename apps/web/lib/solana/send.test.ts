// @vitest-environment node
import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createSignerFromKeyPair,
  createTransactionMessage,
  generateKeyPair,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SolanaError,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { beforeAll, describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { failedInstructionIndex, type SendRpc, signAndSend } from "./send";

let keyPair: CryptoKeyPair;
let transactionBase64: string;

beforeAll(async () => {
  keyPair = await generateKeyPair();
  const payer = await createSignerFromKeyPair(keyPair);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash("HV7k6L9QZQo6cDN1GwbfRdWFz3iQQJa1LXJQtvQASWXJ"),
          lastValidBlockHeight: 1n,
        },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        { programAddress: address("11111111111111111111111111111111") },
        m,
      ),
  );
  const bytes = getTransactionEncoder().encode(compileTransaction(message));
  transactionBase64 = getBase64Decoder().decode(bytes);
});

type FakeOptions = {
  simulationErr?: unknown;
  simulationLogs?: string[];
  /** Lo que lanza cada método del RPC; statuses: cuántas veces seguidas lanza ("always" = siempre). */
  throws?: {
    simulate?: unknown;
    send?: unknown;
    statuses?: { error: unknown; times: number | "always" };
  };
  statuses?: Array<{ confirmationStatus: string; err: unknown } | null>;
  meta?: { err: unknown; logMessages: string[]; fee?: unknown };
};

function fakeRpc({
  simulationErr = null,
  simulationLogs = ["sim log"],
  statuses,
  meta,
  throws = {},
}: FakeOptions = {}) {
  const sent: Array<{ wire: string; config: unknown }> = [];
  const queue = statuses ?? [{ confirmationStatus: "confirmed", err: null }];
  const reply = <T>(value: T) => ({ send: async () => value });
  const fail = (error: unknown) => ({
    send: async () => {
      throw error;
    },
  });
  let statusFailures = 0;
  const rpc = {
    simulateTransaction: () =>
      throws.simulate
        ? fail(throws.simulate)
        : reply({ value: { err: simulationErr, logs: simulationLogs } }),
    sendTransaction: (wire: string, config: unknown) => {
      if (throws.send) return fail(throws.send);
      sent.push({ wire, config });
      return reply("sig-from-rpc");
    },
    getSignatureStatuses: () => {
      const t = throws.statuses;
      if (t && (t.times === "always" || statusFailures < t.times)) {
        statusFailures += 1;
        return fail(t.error);
      }
      return reply({ value: [queue.length > 1 ? queue.shift() : queue[0]] });
    },
    getTransaction: () => reply({ meta: meta ?? { err: null, logMessages: ["Program log: ok"] } }),
  } as unknown as SendRpc;
  return { rpc, sent };
}

const base = () => ({
  keyPair,
  transactionBase64,
  guardAssertIndex: 7,
  signal: new AbortController().signal,
  pollIntervalMs: 1,
  timeoutMs: 200,
});

describe("signAndSend", () => {
  it("signs, simulates, sends and returns the confirmed signature", async () => {
    const { rpc, sent } = fakeRpc({
      statuses: [null, { confirmationStatus: "confirmed", err: null }],
    });
    const result = await signAndSend({ rpc, ...base() });
    expect(result).toEqual({
      signature: expect.any(String),
      err: null,
      logs: ["Program log: ok"],
      fee: null,
    });
    expect(result.signature).not.toBe("sig-from-rpc");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.wire).not.toBe(transactionBase64);
  });

  it("sends a guard failure with skipPreflight so it reverts on-chain", async () => {
    const guardErr = { InstructionError: [7, { Custom: 6004 }] };
    const { rpc, sent } = fakeRpc({
      simulationErr: guardErr,
      simulationLogs: ["Program log: GUARD_FAIL received=1 min=2"],
      statuses: [{ confirmationStatus: "confirmed", err: guardErr }],
      meta: { err: guardErr, logMessages: ["Program log: GUARD_FAIL received=1 min=2"] },
    });
    const result = await signAndSend({ rpc, ...base() });
    expect(sent[0]?.config).toMatchObject({ encoding: "base64", skipPreflight: true });
    expect(result.err).toEqual(guardErr);
    expect(result.logs).toEqual(["Program log: GUARD_FAIL received=1 min=2"]);
  });

  it("does not send when the assert step fails without GUARD_FAIL in the logs", async () => {
    const { rpc, sent } = fakeRpc({
      simulationErr: { InstructionError: [7, "InvalidAccountData"] },
      simulationLogs: ["Program log: Instruction: AssertMinDelta"],
    });
    const error = await signAndSend({ rpc, ...base() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe("INTERNAL");
    expect((error as ApiClientError).message).toContain("step 7");
    expect(sent).toHaveLength(0);
  });

  it("returns the network fee read from meta.fee (D16)", async () => {
    const guardErr = { InstructionError: [7, { Custom: 6004 }] };
    const { rpc } = fakeRpc({
      simulationErr: guardErr,
      simulationLogs: ["Program log: GUARD_FAIL received=1 min=2"],
      statuses: [{ confirmationStatus: "confirmed", err: guardErr }],
      meta: { err: guardErr, logMessages: [], fee: 5000n },
    });
    const result = await signAndSend({ rpc, ...base() });
    expect(result.fee).toBe(5000n);
  });

  it("gives no fee when meta.fee is missing or not a bigint", async () => {
    for (const fee of [undefined, null, 5000, "5000"]) {
      const { rpc } = fakeRpc({ meta: { err: null, logMessages: [], fee } });
      expect((await signAndSend({ rpc, ...base() })).fee).toBeNull();
    }
  });

  it("does not send when simulation fails at a non-guard step", async () => {
    const { rpc, sent } = fakeRpc({ simulationErr: { InstructionError: [4, { Custom: 1 }] } });
    const error = await signAndSend({ rpc, ...base() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).message).toContain("step 4");
    expect(sent).toHaveLength(0);
  });

  it("maps BlockhashNotFound to BUILD_EXPIRED", async () => {
    const { rpc, sent } = fakeRpc({ simulationErr: "BlockhashNotFound" });
    const error = await signAndSend({ rpc, ...base() }).catch((e: unknown) => e);
    expect((error as ApiClientError).code).toBe("BUILD_EXPIRED");
    expect(sent).toHaveLength(0);
  });

  it("after timeoutMs keeps the signature and never says BUILD_EXPIRED", async () => {
    // Enviada y sin estado: puede entrar después, así que no se puede dar por caducada.
    const { rpc, sent } = fakeRpc({ statuses: [null] });
    const error = (await signAndSend({ rpc, ...base(), timeoutMs: 20 }).catch(
      (e: unknown) => e,
    )) as ApiClientError;
    expect(sent).toHaveLength(1);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).not.toBe("BUILD_EXPIRED");
    expect(error.details).toMatchObject({ signature: expect.any(String) });
    expect(error.message).toContain((error.details as { signature: string }).signature);
  });

  it("stops when the signal aborts", async () => {
    const { rpc } = fakeRpc({ statuses: [null] });
    const controller = new AbortController();
    const pending = signAndSend({ rpc, ...base(), signal: controller.signal, timeoutMs: 5_000 });
    controller.abort();
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBe(controller.signal.reason);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

const httpError = (statusCode: number) =>
  new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, {
    headers: new Headers(),
    message: "HTTP error",
    statusCode,
  });

describe("signAndSend when the rpc fails", () => {
  it("keeps polling after a transient error and returns the confirmed result", async () => {
    const { rpc } = fakeRpc({ throws: { statuses: { error: httpError(502), times: 1 } } });
    const result = await signAndSend({ rpc, ...base() });
    expect(result.err).toBeNull();
  });

  it("keeps the signature when the result cannot be read", async () => {
    const { rpc, sent } = fakeRpc({
      throws: { statuses: { error: httpError(502), times: "always" } },
    });
    const error = (await signAndSend({ rpc, ...base(), timeoutMs: 20 }).catch(
      (e: unknown) => e,
    )) as ApiClientError;
    expect(sent).toHaveLength(1);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.details).toMatchObject({ signature: expect.any(String) });
    expect(error.message).toContain((error.details as { signature: string }).signature);
  });

  it("maps a blockhash that expires at send to BUILD_EXPIRED", async () => {
    const preflight = new SolanaError(
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
      { cause: new SolanaError(SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND) } as never,
    );
    const { rpc } = fakeRpc({ throws: { send: preflight } });
    const error = (await signAndSend({ rpc, ...base() }).catch(
      (e: unknown) => e,
    )) as ApiClientError;
    expect(error.code).toBe("BUILD_EXPIRED");
  });

  it("maps a 429 from the rpc route to RATE_LIMITED", async () => {
    const { rpc } = fakeRpc({ throws: { simulate: httpError(429) } });
    const error = (await signAndSend({ rpc, ...base() }).catch(
      (e: unknown) => e,
    )) as ApiClientError;
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("turns other Kit errors into a plain message", async () => {
    const { rpc } = fakeRpc({ throws: { simulate: httpError(502) } });
    const error = (await signAndSend({ rpc, ...base() }).catch(
      (e: unknown) => e,
    )) as ApiClientError;
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).toBe("INTERNAL");
    expect(error.message).not.toMatch(/Solana error|HTTP error/);
  });
});

describe("failedInstructionIndex", () => {
  it("reads a number index", () => {
    expect(failedInstructionIndex({ InstructionError: [7, { Custom: 6004 }] })).toBe(7);
  });

  it("reads a bigint index", () => {
    expect(failedInstructionIndex({ InstructionError: [3n, "InvalidArgument"] })).toBe(3);
  });

  it("is null for any other shape", () => {
    expect(failedInstructionIndex("BlockhashNotFound")).toBeNull();
    expect(failedInstructionIndex(null)).toBeNull();
    expect(failedInstructionIndex({ InstructionError: ["x"] })).toBeNull();
  });
});
