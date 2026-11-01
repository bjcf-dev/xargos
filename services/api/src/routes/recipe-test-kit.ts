import { address, type Instruction, type Rpc, type SolanaRpcApi } from "@solana/kit";
import type { FacilitatorClient } from "@x402/core/server";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { getAssertMinDeltaInstruction, getSnapshotInstruction } from "@xargos/guard-client";
import { expect } from "vitest";
import type { Recipe } from "../recipes/types";
import { BuildStore } from "../store/build-store";
import { createRecipeRoutes } from "./recipes";

const PAYER = "A3zwodWASq2rCTSwjiRvzrRMNKLEP7bMwC3azd4X5nDj";
const PAY_TO = "3NxLt5rLgsT46ngFjUj2VQhsfhu1miEmARUTS8gN1MYw";
const FEE_PAYER = "3qybJ9ApEBWun7xvbnrVJ6NfDpvRGTBbppfxaFENe6SC";
export const AGENT = "Vote111111111111111111111111111111111111111";
export const MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const WATCHED = address("SysvarC1ock11111111111111111111111111111111");
export const SNAPSHOT = address("SysvarRent111111111111111111111111111111111");
export const GUARD = address("97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm");
export const config = { programAddress: GUARD };

function fakeFacilitator(
  failures: string[] = [],
  { verify, settle }: Pick<Partial<FacilitatorClient>, "verify" | "settle"> = {},
) {
  const calls = { verify: 0, settle: 0, build: 0 };
  const facilitator: FacilitatorClient = {
    verify: async (...args) => {
      calls.verify++;
      return verify ? verify(...args) : { isValid: true, payer: PAYER };
    },
    settle: async (...args) => {
      calls.settle++;
      if (settle) return settle(...args);
      const errorReason = failures[calls.settle - 1];
      if (errorReason) {
        return {
          success: false,
          errorReason,
          transaction: "",
          network: SOLANA_DEVNET_CAIP2,
          payer: PAYER,
        };
      }
      return {
        success: true,
        transaction: "fake-signature",
        network: SOLANA_DEVNET_CAIP2,
        payer: PAYER,
      };
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
  return { facilitator, calls };
}

export const step = (instruction: Instruction, label: string) => ({
  instruction,
  label,
  protocol: "xARGOS guard",
  kind: "guard" as const,
});

const recipe = (build?: Recipe["build"]): Recipe => ({
  info: {
    id: "exit-orca-lp-to-usdc",
    name: "Exit",
    description: "x",
    price: { amount: "10000", mint: MINT },
  },
  build:
    build ??
    (async () => ({
      steps: [
        step(
          getSnapshotInstruction({ agentTokenAccount: WATCHED, snapshot: SNAPSHOT }, config),
          "Record",
        ),
        step(
          getAssertMinDeltaInstruction(
            { agentTokenAccount: WATCHED, snapshot: SNAPSHOT, minDelta: 9_900_000n },
            config,
          ),
          "Check",
        ),
      ],
      quote: { tokenOut: MINT, expectedOut: "10000000", slippageBps: 100 },
      guard: { programId: GUARD, mint: MINT, watchedAccount: WATCHED, minDelta: "9900000" },
    })),
});

const fakeRpc = (simulationErr: unknown = null) =>
  ({
    getLatestBlockhash: () => ({
      send: async () => ({
        value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1n },
      }),
    }),
    simulateTransaction: () => ({
      send: async () => ({ value: { err: simulationErr, logs: [] } }),
    }),
  }) as unknown as Rpc<SolanaRpcApi>;

/** The paid route with a fake facilitator and RPC. */
export function setup(
  options: {
    build?: Recipe["build"];
    verify?: FacilitatorClient["verify"];
    settle?: FacilitatorClient["settle"];
    simulationErr?: unknown;
    settleFailures?: string[];
    now?: () => number;
    publicUrl?: string;
  } = {},
) {
  const { verify, settle } = options;
  const { facilitator, calls } = fakeFacilitator(options.settleFailures, {
    ...(verify ? { verify } : {}),
    ...(settle ? { settle } : {}),
  });
  const counted = recipe(options.build);
  const buildRecipe = counted.build;
  counted.build = (...args) => {
    calls.build++;
    return buildRecipe(...args);
  };
  const store = new BuildStore(options.now);
  const app = createRecipeRoutes({
    recipes: [counted],
    rpc: fakeRpc(options.simulationErr),
    store,
    facilitator,
    payTo: PAY_TO,
    price: "$0.01",
    publicUrl: options.publicUrl,
  });
  const url = "/recipes/exit-orca-lp-to-usdc/build";
  const body = JSON.stringify({ agent: AGENT, position: MINT });
  const post = (headers: Record<string, string> = {}) =>
    app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  /** First ask (402), then repeat with a payment; `tweak` lets a test pay the wrong thing. */
  async function postPaid(
    tweak: (accepted: Record<string, unknown>) => Record<string, unknown> = (a) => a,
  ) {
    const first = await post();
    expect(first.status).toBe(402);
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
  return { app, calls, store, post, postPaid };
}
