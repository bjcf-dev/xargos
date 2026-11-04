import {
  address,
  generateKeyPairSigner,
  type Instruction,
  type Rpc,
  SOLANA_ERROR__JSON_RPC__INTERNAL_ERROR,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SolanaError,
  type SolanaRpcApi,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { createSender, isTransient } from "./send";

const internalError = () =>
  new SolanaError(SOLANA_ERROR__JSON_RPC__INTERNAL_ERROR, { __serverMessage: "Internal error" });

const memo: Instruction = {
  programAddress: address("MemoSq4gqABAXKb96qnH8TuMeLLwg7WxxpKj37Z5wGh"),
  data: new Uint8Array([1]),
};

/** RPC with a fixed blockhash; `landed` says what getSignatureStatuses reports. */
function fakeRpc({ landed = false } = {}) {
  const calls = { statuses: 0 };
  const rpc = {
    getLatestBlockhash: () => ({
      send: async () => ({
        value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1n },
      }),
    }),
    getSignatureStatuses: () => ({
      send: async () => {
        calls.statuses++;
        return {
          value: [landed ? { confirmationStatus: "confirmed", err: null } : null],
        };
      },
    }),
  } as unknown as Rpc<SolanaRpcApi>;
  return { rpc, calls };
}

async function setup(failures: unknown[], options: { landed?: boolean } = {}) {
  const payer = await generateKeyPairSigner();
  const { rpc, calls } = fakeRpc(options);
  const sent: string[] = [];
  const logged: object[] = [];
  const send = createSender(rpc, {} as never, payer, {
    log: { error: (data) => logged.push(data) },
    sleep: async () => {},
    sendAndConfirm: async (transaction) => {
      sent.push(Buffer.from(transaction.messageBytes).toString("base64"));
      const failure = failures[sent.length - 1];
      if (failure) throw failure;
    },
  });
  return { send, sent, logged, calls };
}

describe("createSender", () => {
  it("resends the same signed transaction after a transient RPC error", async () => {
    const s = await setup([internalError()]);
    const signature = await s.send([memo]);
    expect(signature).toBeTruthy();
    expect(s.sent).toHaveLength(2);
    expect(s.sent[1]).toBe(s.sent[0]); // same bytes: never signed again
    expect(s.logged).toEqual([
      expect.objectContaining({ call: "sendAndConfirmTransaction", attempt: 1 }),
    ]);
  });

  it("does not resend when the first attempt already landed", async () => {
    const s = await setup([internalError()], { landed: true });
    await s.send([memo]);
    expect(s.sent).toHaveLength(1);
    expect(s.calls.statuses).toBe(1);
  });

  it("gives up after two retries and passes the error to the caller", async () => {
    const error = internalError();
    const s = await setup([error, error, error, error]);
    await expect(s.send([memo])).rejects.toBe(error);
    expect(s.sent).toHaveLength(3);
  });

  it("does not retry an error that would happen again", async () => {
    const preflight = new SolanaError(
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
      {} as never,
    );
    const s = await setup([preflight]);
    await expect(s.send([memo])).rejects.toBe(preflight);
    expect(s.sent).toHaveLength(1);
    expect(s.logged).toHaveLength(0);
  });
});

describe("isTransient", () => {
  it("covers the RPC's internal error and network failures only", () => {
    expect(isTransient(internalError())).toBe(true);
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
    expect(isTransient(new Error("simulation failed"))).toBe(false);
  });
});
