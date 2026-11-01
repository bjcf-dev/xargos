import { getAssertMinDeltaInstruction, getSnapshotInstruction } from "@xargos/guard-client";
import { BuildResponse, ErrorResponse } from "@xargos/shared";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../recipes/types";
import { AGENT, config, GUARD, MINT, SNAPSHOT, setup, step, WATCHED } from "./recipe-test-kit";

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

  it("caps the free rebuilds of one build", async () => {
    const { app, postPaid } = setup();
    const first = BuildResponse.parse(await (await postPaid()).json());
    const rebuild = () =>
      app.request("/recipes/exit-orca-lp-to-usdc/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rebuildBody(first.buildId),
      });
    for (let i = 0; i < 5; i++) expect((await rebuild()).status).toBe(200);
    const blocked = await rebuild();
    expect(blocked.status).toBe(410);
    expect(ErrorResponse.parse(await blocked.json()).error.code).toBe("REBUILD_WINDOW_CLOSED");
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

describe("a build only counts once its payment settled (P1-4)", () => {
  it("keeps the x402 receipt with a settled build", async () => {
    const { postPaid, store } = setup();
    const response = BuildResponse.parse(await (await postPaid()).json());
    expect(store.get(response.buildId)?.paymentResponse).toBeTruthy();
  });

  it("forgets the build when the settlement fails: no rebuild and no shock from it", async () => {
    const { postPaid, store } = setup({ settleFailures: ["insufficient_funds"] });
    const res = await postPaid();
    expect(res.ok).toBe(false);
    expect(store.size).toBe(0);
    expect(store.latestLiveBuildFor(AGENT)).toBeUndefined();
  });

  it("does not sell a second recipe for a payment sent twice", async () => {
    // The real facilitator answers duplicate_settlement (@x402/svm's SettlementCache).
    const { postPaid, calls, store } = setup({ settleFailures: ["", "duplicate_settlement"] });
    const first = await postPaid();
    expect(first.status).toBe(200);
    const second = await postPaid();
    expect(second.ok).toBe(false);
    expect(await second.text()).not.toContain('transaction":"');
    expect(calls.settle).toBe(2);
    expect(store.size).toBe(1);
  });
});
