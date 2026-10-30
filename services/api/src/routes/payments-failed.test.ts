import { address, type Rpc, type SolanaRpcApi } from "@solana/kit";
import type { FacilitatorClient } from "@x402/core/server";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { getAssertMinDeltaInstruction, getSnapshotInstruction } from "@xargos/guard-client";
import { describe, expect, it } from "vitest";
import type { Recipe } from "../recipes/types";
import { BuildStore } from "../store/build-store";
import { createRecipeRoutes } from "./recipes";

const PAYER = "A3zwodWASq2rCTSwjiRvzrRMNKLEP7bMwC3azd4X5nDj";
const PAY_TO = "3NxLt5rLgsT46ngFjUj2VQhsfhu1miEmARUTS8gN1MYw";
const FEE_PAYER = "3qybJ9ApEBWun7xvbnrVJ6NfDpvRGTBbppfxaFENe6SC";
const AGENT = "Vote111111111111111111111111111111111111111";
const MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const WATCHED = address("SysvarC1ock11111111111111111111111111111111");
const SNAPSHOT = address("SysvarRent111111111111111111111111111111111");
const GUARD = address("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm");
const config = { programAddress: GUARD };
const URL = "/recipes/exit-orca-lp-to-usdc/build";

type Behaviour = {
  verify?: FacilitatorClient["verify"];
  settle?: FacilitatorClient["settle"];
};

function setup({ verify, settle }: Behaviour = {}) {
  const calls = { verify: 0, settle: 0, build: 0 };
  const facilitator: FacilitatorClient = {
    verify: async (...args) => {
      calls.verify++;
      return verify ? verify(...args) : { isValid: true, payer: PAYER };
    },
    settle: async (...args) => {
      calls.settle++;
      return settle
        ? settle(...args)
        : { success: true, transaction: "sig", network: SOLANA_DEVNET_CAIP2, payer: PAYER };
    },
    getSupported: async () => ({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          extra: { feePayer: FEE_PAYER },
        },
      ],
      extensions: [],
      signers: {},
    }),
  };
  const recipe: Recipe = {
    info: {
      id: "exit-orca-lp-to-usdc",
      name: "Exit",
      description: "x",
      price: { amount: "10000", mint: MINT },
    },
    build: async () => {
      calls.build++;
      return {
        steps: [
          {
            instruction: getSnapshotInstruction(
              { agentTokenAccount: WATCHED, snapshot: SNAPSHOT },
              config,
            ),
            label: "Record",
            protocol: "xARGOS guard",
            kind: "guard" as const,
          },
          {
            instruction: getAssertMinDeltaInstruction(
              { agentTokenAccount: WATCHED, snapshot: SNAPSHOT, minDelta: 9_900_000n },
              config,
            ),
            label: "Check",
            protocol: "xARGOS guard",
            kind: "guard" as const,
          },
        ],
        quote: { tokenOut: MINT, expectedOut: "10000000", slippageBps: 100 },
        guard: { programId: GUARD, mint: MINT, watchedAccount: WATCHED, minDelta: "9900000" },
      };
    },
  };
  const rpc = {
    getLatestBlockhash: () => ({
      send: async () => ({
        value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1n },
      }),
    }),
    simulateTransaction: () => ({ send: async () => ({ value: { err: null, logs: [] } }) }),
  } as unknown as Rpc<SolanaRpcApi>;
  const store = new BuildStore();
  const app = createRecipeRoutes({
    recipes: [recipe],
    rpc,
    store,
    facilitator,
    payTo: PAY_TO,
    price: "$0.01",
  });
  const body = JSON.stringify({ agent: AGENT, position: MINT });
  const post = (headers: Record<string, string> = {}) =>
    app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

  /** Ask (402), then repeat with a payment; `tweak` lets a test pay the wrong thing. */
  async function postPaid(
    tweak: (accepted: Record<string, unknown>) => Record<string, unknown> = (a) => a,
  ) {
    const first = await post();
    const required = JSON.parse(
      Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(),
    );
    const payload = {
      x402Version: 2,
      resource: required.resource,
      accepted: tweak(required.accepts[0]),
      payload: {},
    };
    return post({ "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") });
  }
  return { calls, store, post, postPaid };
}

const expectNothingBuiltNorCharged = (s: ReturnType<typeof setup>) => {
  expect(s.calls.build).toBe(0);
  expect(s.calls.settle).toBe(0);
  expect(s.store.size).toBe(0);
};

describe("failed payments on POST /recipes/:id/build", () => {
  it("rejects a payment the facilitator finds invalid: 402, nothing built or settled", async () => {
    const s = setup({
      verify: async () => ({ isValid: false, invalidReason: "invalid_exact_svm_payload" }),
    });
    const res = await s.postPaid();
    expect(res.status).toBe(402);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    expect(s.calls.verify).toBeGreaterThan(0);
    expectNothingBuiltNorCharged(s);
  });

  it("rejects a payment for a smaller amount than the price", async () => {
    const s = setup();
    const res = await s.postPaid((accepted) => ({ ...accepted, amount: "1" }));
    expect(res.status).toBe(402);
    expectNothingBuiltNorCharged(s);
  });

  it("rejects a payment addressed to someone else", async () => {
    const s = setup();
    const res = await s.postPaid((accepted) => ({ ...accepted, payTo: AGENT }));
    expect(res.status).toBe(402);
    expectNothingBuiltNorCharged(s);
  });

  it("rejects a malformed PAYMENT-SIGNATURE header", async () => {
    const s = setup();
    const res = await s.post({ "PAYMENT-SIGNATURE": "not-base64-json" });
    expect(res.status).toBe(402);
    expectNothingBuiltNorCharged(s);
  });

  it("never builds when the facilitator is down", async () => {
    const s = setup({
      verify: async () => {
        throw new Error("facilitator unreachable https://rpc.example/?api-key=SECRET");
      },
    });
    const res = await s.postPaid();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toContain("SECRET");
    expectNothingBuiltNorCharged(s);
  });

  it("does not hand over the transaction when the settlement fails", async () => {
    const s = setup({
      settle: async () => ({
        success: false,
        errorReason: "insufficient_funds",
        transaction: "",
        network: SOLANA_DEVNET_CAIP2,
      }),
    });
    const res = await s.postPaid();
    expect(res.status).toBe(402);
    expect(await res.json()).not.toHaveProperty("transaction");
    expect(s.calls.settle).toBe(1);
  });
});
