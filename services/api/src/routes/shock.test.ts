import { ErrorResponse, PriceShockStatus } from "@xargos/shared";
import { describe, expect, it, vi } from "vitest";
import { ShockGate, ShockJobs, type ShockSteps } from "../demo/shock";
import { RateLimiter } from "../http/rate-limit";
import { BuildStore } from "../store/build-store";
import { createShockRoutes } from "./shock";

const AGENT = "Vote111111111111111111111111111111111111111";
const fixtureBuild = {
  response: {
    buildId: "bld_1",
    rebuildUntil: new Date(Date.now() + 60_000).toISOString(),
  },
  agent: AGENT,
  position: "p",
} as never;

const steps = (overrides: Partial<ShockSteps> = {}): ShockSteps => ({
  shock: async () => ({ signature: "sig", priceBefore: "150", priceAfter: "141" }),
  restore: async () => {},
  ...overrides,
});

function setup(
  options: { steps?: ShockSteps; accessCode?: string; withBuild?: boolean; limit?: number } = {},
) {
  const store = new BuildStore();
  if (options.withBuild !== false) store.put(fixtureBuild);
  const scheduled: Array<{ task: () => void; ms: number }> = [];
  const app = createShockRoutes({
    jobs: new ShockJobs(),
    gate: new ShockGate(120_000),
    steps: options.steps ?? steps(),
    store,
    limiter: new RateLimiter(options.limit ?? 10, 60_000),
    cooldownMs: 120_000,
    accessCode: options.accessCode,
    schedule: (task, ms) => void scheduled.push({ task, ms }),
  });
  const post = (headers: Record<string, string> = {}, agent = AGENT) =>
    app.request("/demo/price-shock", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ agent }),
    });
  const status = async (id: string) =>
    PriceShockStatus.parse(await (await app.request(`/demo/price-shock/${id}`)).json());
  return { app, post, status, scheduled };
}

describe("POST /demo/price-shock", () => {
  it("answers 202 with a shockId and ends confirmed with the prices", async () => {
    const { post, status } = setup();
    const res = await post();
    expect(res.status).toBe(202);
    const { shockId } = (await res.json()) as { shockId: string };
    await vi.waitFor(async () => expect((await status(shockId)).status).toBe("confirmed"));
    expect(await status(shockId)).toMatchObject({
      signature: "sig",
      priceBefore: "150",
      priceAfter: "141",
    });
  });

  it("schedules the restore after the cooldown, not right away", async () => {
    const restore = vi.fn(async () => {});
    const { post, status, scheduled } = setup({ steps: steps({ restore }) });
    const { shockId } = (await (await post()).json()) as { shockId: string };
    await vi.waitFor(async () => expect((await status(shockId)).status).toBe("confirmed"));
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.ms).toBe(120_000);
    expect(restore).not.toHaveBeenCalled();
    scheduled[0]?.task();
    expect(restore).toHaveBeenCalledOnce();
  });

  it("allows one shock at a time and while the pool is recovering", async () => {
    const { post } = setup();
    expect((await post()).status).toBe(202);
    const second = await post();
    expect(second.status).toBe(429);
    expect(ErrorResponse.parse(await second.json()).error.code).toBe("RATE_LIMITED");
  });

  it("ends failed with a generic SHOCK_FAILED and frees the gate", async () => {
    let calls = 0;
    const { post, status } = setup({
      steps: steps({
        shock: async () => {
          calls += 1;
          if (calls === 1) throw new Error("rpc down https://rpc.example/?api-key=SECRET");
          return { signature: "sig", priceBefore: "150", priceAfter: "141" };
        },
      }),
    });
    const { shockId } = (await (await post()).json()) as { shockId: string };
    await vi.waitFor(async () => expect((await status(shockId)).status).toBe("failed"));
    const failed = await status(shockId);
    expect(failed.error?.code).toBe("SHOCK_FAILED");
    expect(JSON.stringify(failed)).not.toContain("SECRET");
    expect((await post()).status).toBe(202); // nothing moved, so the next shock may start
  });

  it("needs the agent to hold a live paid build", async () => {
    const { post } = setup({ withBuild: false });
    const res = await post();
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("requires the access code header when one is configured", async () => {
    const { post } = setup({ accessCode: "secret-code" });
    expect((await post()).status).toBe(403);
    expect((await post({ "x-xargos-access-code": "wrong" })).status).toBe(403);
    expect((await post({ "x-xargos-access-code": "secret-code" })).status).toBe(202);
  });

  it("rate limits requests", async () => {
    const { post } = setup({ limit: 1 });
    expect((await post()).status).toBe(202);
    expect((await post()).status).toBe(429);
  });

  it("rejects a malformed body and an unknown shock", async () => {
    const { app, post } = setup();
    expect((await post({}, "nope")).status).toBe(400);
    expect((await app.request("/demo/price-shock/shk_unknown")).status).toBe(400);
  });
});
