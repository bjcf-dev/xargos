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
  statuses?: Array<{ confirmationStatus: string; err: unknown } | null>;
  meta?: { err: unknown; logMessages: string[] };
};

function fakeRpc({ simulationErr = null, statuses, meta }: FakeOptions = {}) {
  const sent: Array<{ wire: string; config: unknown }> = [];
  const queue = statuses ?? [{ confirmationStatus: "confirmed", err: null }];
  const reply = <T>(value: T) => ({ send: async () => value });
  const rpc = {
    simulateTransaction: () => reply({ value: { err: simulationErr, logs: ["sim log"] } }),
    sendTransaction: (wire: string, config: unknown) => {
      sent.push({ wire, config });
      return reply("sig-from-rpc");
    },
    getSignatureStatuses: () => reply({ value: [queue.length > 1 ? queue.shift() : queue[0]] }),
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
    expect(result).toEqual({ signature: expect.any(String), err: null, logs: ["Program log: ok"] });
    expect(result.signature).not.toBe("sig-from-rpc");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.wire).not.toBe(transactionBase64);
  });

  it("sends a guard failure with skipPreflight so it reverts on-chain", async () => {
    const guardErr = { InstructionError: [7, { Custom: 6004 }] };
    const { rpc, sent } = fakeRpc({
      simulationErr: guardErr,
      statuses: [{ confirmationStatus: "confirmed", err: guardErr }],
      meta: { err: guardErr, logMessages: ["Program log: GUARD_FAIL received=1 min=2"] },
    });
    const result = await signAndSend({ rpc, ...base() });
    expect(sent[0]?.config).toMatchObject({ encoding: "base64", skipPreflight: true });
    expect(result.err).toEqual(guardErr);
    expect(result.logs).toEqual(["Program log: GUARD_FAIL received=1 min=2"]);
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

  it("gives up with BUILD_EXPIRED after timeoutMs", async () => {
    const { rpc } = fakeRpc({ statuses: [null] });
    const error = await signAndSend({ rpc, ...base(), timeoutMs: 20 }).catch((e: unknown) => e);
    expect((error as ApiClientError).code).toBe("BUILD_EXPIRED");
  });

  it("stops when the signal aborts", async () => {
    const { rpc } = fakeRpc({ statuses: [null] });
    const controller = new AbortController();
    const pending = signAndSend({ rpc, ...base(), signal: controller.signal, timeoutMs: 5_000 });
    controller.abort();
    await expect(pending).rejects.toThrow();
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
