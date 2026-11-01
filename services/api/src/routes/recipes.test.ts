import { address, type Instruction, type Rpc, type SolanaRpcApi } from "@solana/kit";
import type { FacilitatorClient } from "@x402/core/server";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { getAssertMinDeltaInstruction, getSnapshotInstruction } from "@xargos/guard-client";
import { BuildResponse, ErrorResponse } from "@xargos/shared";
import { describe, expect, it, vi } from "vitest";
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

function fakeFacilitator() {
  const calls = { verify: 0, settle: 0 };
  const facilitator: FacilitatorClient = {
    verify: async () => {
      calls.verify++;
      return { isValid: true, payer: PAYER };
    },
    settle: async () => {
      calls.settle++;
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

const step = (instruction: Instruction, label: string) => ({
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

function setup(
  options: {
    build?: Recipe["build"];
    simulationErr?: unknown;
    now?: () => number;
    publicUrl?: string;
  } = {},
) {
  const { facilitator, calls } = fakeFacilitator();
  const store = new BuildStore(options.now);
  const app = createRecipeRoutes({
    recipes: [recipe(options.build)],
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
  /** First ask (402), then repeat with a payment, like an x402 client does. */
  async function postPaid() {
    const first = await post();
    expect(first.status).toBe(402);
    const required = JSON.parse(
      Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(),
    );
    const payload = {
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: {},
    };
    return post({ "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") });
  }
  return { app, calls, store, post, postPaid };
}

describe("POST /recipes/:id/build with x402", () => {
  it("asks for payment first and does not build anything", async () => {
    const build = vi.fn();
    const { post, calls } = setup({ build });
    expect((await post()).status).toBe(402);
    expect(build).not.toHaveBeenCalled();
    expect(calls.settle).toBe(0);
  });

  it("names the public proxy URL as the paid resource (D20)", async () => {
    const { post } = setup({ publicUrl: "https://app.example/api/xargos/" });
    const res = await post();
    expect(res.status).toBe(402);
    const required = JSON.parse(
      Buffer.from(res.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(),
    );
    expect(required.resource.url).toBe(
      "https://app.example/api/xargos/recipes/exit-orca-lp-to-usdc/build",
    );
  });

  it("falls back to the request URL when no public URL is set", async () => {
    const { post } = setup();
    const required = JSON.parse(
      Buffer.from((await post()).headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(),
    );
    expect(required.resource.url).toBe("http://localhost/recipes/exit-orca-lp-to-usdc/build");
  });

  it("verifies, builds, simulates, stores and settles once", async () => {
    const { postPaid, calls, store } = setup();
    const res = await postPaid();
    expect(res.status).toBe(200);
    const response = BuildResponse.parse(await res.json());
    expect(store.get(response.buildId)?.response.guard.minDelta).toBe("9900000");
    expect(calls.verify).toBeGreaterThan(0);
    expect(calls.settle).toBe(1);
  });

  it("does not settle when the simulation fails (B8 criterion)", async () => {
    const { postPaid, calls, store } = setup({
      simulationErr: { InstructionError: [0, { Custom: 6004 }] },
    });
    const res = await postPaid();
    expect(res.status).toBe(500);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("BUILD_FAILED");
    expect(calls.settle).toBe(0);
    expect(store.size).toBe(0);
  });

  it("does not settle when the recipe cannot be built, and hides the cause", async () => {
    const { postPaid, calls } = setup({
      build: async () => {
        throw new Error("rpc down https://rpc.example/?api-key=SECRET");
      },
    });
    const res = await postPaid();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET");
    expect(calls.settle).toBe(0);
  });

  it("does not settle a paid request with an invalid body", async () => {
    const { app, calls } = setup();
    const url = "/recipes/exit-orca-lp-to-usdc/build";
    const first = await app.request(url, { method: "POST", body: "{}" });
    const required = JSON.parse(
      Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(),
    );
    const payload = {
      x402Version: 2,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: {},
    };
    const res = await app.request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64"),
      },
      body: JSON.stringify({ agent: "not-an-address" }),
    });
    expect(res.status).toBe(400);
    expect(calls.settle).toBe(0);
  });

  it("lists the recipes for free", async () => {
    const { app } = setup();
    const res = await app.request("/recipes");
    expect(res.status).toBe(200);
    expect(((await res.json()) as Array<{ id: string }>)[0]?.id).toBe("exit-orca-lp-to-usdc");
  });
});

describe("free rebuild with a buildId (D19)", () => {
  /** Recipe whose fresh quote would be different, to prove a rebuild keeps the promised one. */
  const quoting =
    (seen: Array<bigint | undefined>): Recipe["build"] =>
    async ({ fixed }) => {
      seen.push(fixed?.minDelta);
      return {
        steps: [
          step(
            getSnapshotInstruction({ agentTokenAccount: WATCHED, snapshot: SNAPSHOT }, config),
            "Record",
          ),
          step(
            getAssertMinDeltaInstruction(
              {
                agentTokenAccount: WATCHED,
                snapshot: SNAPSHOT,
                minDelta: fixed?.minDelta ?? 9_900_000n,
              },
              config,
            ),
            "Check",
          ),
        ],
        quote: {
          tokenOut: MINT,
          expectedOut: fixed ? String(fixed.expectedOut) : "10000000",
          slippageBps: 100,
        },
        guard: {
          programId: GUARD,
          mint: MINT,
          watchedAccount: WATCHED,
          minDelta: String(fixed?.minDelta ?? 9_900_000n),
        },
      };
    };

  const rebuildBody = (buildId: string, agent = AGENT) =>
    JSON.stringify({ agent, position: MINT, buildId });

  it("rebuilds the same buildId without charging again", async () => {
    const seen: Array<bigint | undefined> = [];
    const { app, postPaid, calls } = setup({ build: quoting(seen) });
    const first = BuildResponse.parse(await (await postPaid()).json());
    expect(calls.settle).toBe(1);

    const res = await app.request("/recipes/exit-orca-lp-to-usdc/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rebuildBody(first.buildId),
    });
    expect(res.status).toBe(200);
    const again = BuildResponse.parse(await res.json());
    expect(again.buildId).toBe(first.buildId);
    expect(calls.settle).toBe(1); // still the first payment only
  });

  it("keeps the promised minimum and the window of the first build", async () => {
    const seen: Array<bigint | undefined> = [];
    const { app, postPaid } = setup({ build: quoting(seen) });
    const first = BuildResponse.parse(await (await postPaid()).json());

    const again = BuildResponse.parse(
      await (
        await app.request("/recipes/exit-orca-lp-to-usdc/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: rebuildBody(first.buildId),
        })
      ).json(),
    );
    expect(seen).toEqual([undefined, BigInt(first.guard.minDelta)]); // the rebuild got the fixed quote
    expect(again.guard.minDelta).toBe(first.guard.minDelta);
    expect(again.rebuildUntil).toBe(first.rebuildUntil);
  });

  it("answers REBUILD_WINDOW_CLOSED for an unknown buildId, without building or charging", async () => {
    const build = vi.fn();
    const { app, calls } = setup({ build });
    const res = await app.request("/recipes/exit-orca-lp-to-usdc/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rebuildBody("bld_unknown"),
    });
    expect(res.status).toBe(410);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("REBUILD_WINDOW_CLOSED");
    expect(build).not.toHaveBeenCalled();
    expect(calls.verify + calls.settle).toBe(0);
  });

  it("closes the window after rebuildUntil", async () => {
    let clock = Date.now();
    const { app, postPaid } = setup({ now: () => clock });
    const first = BuildResponse.parse(await (await postPaid()).json());
    clock += 121_000;
    const res = await app.request("/recipes/exit-orca-lp-to-usdc/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rebuildBody(first.buildId),
    });
    expect(res.status).toBe(410);
  });

  it("does not rebuild somebody else's build", async () => {
    const { app, postPaid } = setup();
    const first = BuildResponse.parse(await (await postPaid()).json());
    const res = await app.request("/recipes/exit-orca-lp-to-usdc/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rebuildBody(first.buildId, "SysvarC1ock11111111111111111111111111111111"),
    });
    expect(res.status).toBe(410);
  });
});
