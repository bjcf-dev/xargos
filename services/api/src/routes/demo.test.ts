import { DemoSetupStatus, ErrorResponse } from "@xargos/shared";
import { describe, expect, it, vi } from "vitest";
import type { SetupSteps } from "../demo/setup-runner";
import { RateLimiter } from "../http/rate-limit";
import { SetupJobs } from "../store/setup-jobs";
import { createDemoRoutes } from "./demo";

const errorBody = async (res: Response) => ErrorResponse.parse(await res.json());
const AGENT = "AgentDemo1111111111111111111111111111111111";
const steps = (overrides: Partial<SetupSteps> = {}): SetupSteps => ({
  fundSol: async () => {},
  fundUsdc: async () => {},
  openPosition: async () => ({ position: "PositionMint1111111111111111111111111111111" }),
  initSnapshot: async () => {},
  balances: async () => ({ sol: "1", usdc: "2" }),
  ...overrides,
});

function setup(
  options: { accessCode?: string; limit?: number; maxJobs?: number; steps?: SetupSteps } = {},
) {
  const jobs = new SetupJobs(options.maxJobs);
  const app = createDemoRoutes({
    jobs,
    steps: options.steps ?? steps(),
    limiter: new RateLimiter(options.limit ?? 10, 60_000),
    accessCode: options.accessCode,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/demo/setup", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { app, jobs, post };
}

describe("POST /demo/setup", () => {
  it("answers 202 with the agent and starts the job", async () => {
    const { post, jobs } = setup();
    const res = await post({ agent: AGENT });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ agent: AGENT });
    expect(jobs.get(AGENT)).toBeDefined();
  });

  it("rejects a malformed body with VALIDATION_ERROR", async () => {
    const { post } = setup();
    const res = await post({ agent: "not-an-address" });
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a wrong access code with ACCESS_DENIED", async () => {
    const { post, jobs } = setup({ accessCode: "secret-code" });
    const res = await post({ agent: AGENT, accessCode: "nope" });
    expect(res.status).toBe(403);
    expect((await errorBody(res)).error.code).toBe("ACCESS_DENIED");
    expect(jobs.get(AGENT)).toBeUndefined();
  });

  it("accepts the right access code", async () => {
    const { post } = setup({ accessCode: "secret-code" });
    expect((await post({ agent: AGENT, accessCode: "secret-code" })).status).toBe(202);
  });

  it("rate limits by IP with RATE_LIMITED", async () => {
    const { post } = setup({ limit: 1 });
    expect((await post({ agent: AGENT }, { "x-forwarded-for": "1.2.3.4" })).status).toBe(202);
    const res = await post({ agent: AGENT }, { "x-forwarded-for": "1.2.3.4" });
    expect(res.status).toBe(429);
    expect((await errorBody(res)).error.code).toBe("RATE_LIMITED");
  });

  it("answers RATE_LIMITED when the demo is full", async () => {
    const { post } = setup({ maxJobs: 0 });
    expect((await post({ agent: AGENT })).status).toBe(429);
  });

  it("does not run a second setup for an agent that already has one", async () => {
    const fundSol = vi.fn(async () => {});
    const { post } = setup({ steps: steps({ fundSol }) });
    await post({ agent: AGENT });
    await post({ agent: AGENT });
    await vi.waitFor(() => expect(fundSol).toHaveBeenCalledTimes(1));
  });
});

describe("GET /demo/setup/:agent", () => {
  it("returns a status that matches the shared contract, ending ready", async () => {
    const { app, post } = setup();
    await post({ agent: AGENT });
    await vi.waitFor(async () => {
      const body = await (await app.request(`/demo/setup/${AGENT}`)).json();
      expect(DemoSetupStatus.parse(body).phase).toBe("ready");
    });
  });

  it("reports a failed setup with SETUP_FAILED", async () => {
    const { app, post } = setup({
      steps: steps({
        fundSol: async () => {
          throw new Error("boom");
        },
      }),
    });
    await post({ agent: AGENT });
    await vi.waitFor(async () => {
      const body = DemoSetupStatus.parse(await (await app.request(`/demo/setup/${AGENT}`)).json());
      expect(body.phase).toBe("failed");
      expect(body.error?.code).toBe("SETUP_FAILED");
    });
  });

  it("rejects an invalid or unknown agent", async () => {
    const { app } = setup();
    expect((await app.request("/demo/setup/xyz")).status).toBe(400);
    expect((await app.request(`/demo/setup/${AGENT}`)).status).toBe(400);
  });
});
