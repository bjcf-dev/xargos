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
  positionIsOpen: async () => true,
  ...overrides,
});

function setup(
  options: {
    accessCode?: string;
    limit?: number;
    maxJobs?: number;
    steps?: SetupSteps;
    global?: number;
    hasFunds?: () => Promise<boolean>;
  } = {},
) {
  const jobs = new SetupJobs(options.maxJobs);
  const app = createDemoRoutes({
    jobs,
    steps: options.steps ?? steps(),
    limiter: new RateLimiter(options.limit ?? 10, 60_000),
    accessCode: options.accessCode,
    ...(options.global ? { globalLimiter: new RateLimiter(options.global, 60_000) } : {}),
    ...(options.hasFunds ? { hasFunds: options.hasFunds } : {}),
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

  it("rate limits with RATE_LIMITED", async () => {
    const { post } = setup({ limit: 1 });
    expect((await post({ agent: AGENT })).status).toBe(202);
    const res = await post({ agent: AGENT });
    expect(res.status).toBe(429);
    expect((await errorBody(res)).error.code).toBe("RATE_LIMITED");
  });

  it("ignores x-forwarded-for, which the client can forge to dodge the limit", async () => {
    const { post } = setup({ limit: 1 });
    expect((await post({ agent: AGENT }, { "x-forwarded-for": "1.1.1.1" })).status).toBe(202);
    expect((await post({ agent: AGENT }, { "x-forwarded-for": "2.2.2.2" })).status).toBe(429);
  });

  it("counts the proxy's client IP header only when the access code is valid", async () => {
    const { post } = setup({ accessCode: "secret-code", limit: 1 });
    const withCode = { agent: AGENT, accessCode: "secret-code" };
    expect((await post(withCode, { "x-xargos-client-ip": "9.9.9.9" })).status).toBe(202);
    // another browser behind the same proxy has its own bucket...
    expect((await post(withCode, { "x-xargos-client-ip": "8.8.8.8" })).status).toBe(202);
    // ...and the first one is limited
    expect((await post(withCode, { "x-xargos-client-ip": "9.9.9.9" })).status).toBe(429);
  });

  it("does not trust the proxy header when no access code is configured", async () => {
    const { post } = setup({ limit: 1 });
    expect((await post({ agent: AGENT }, { "x-xargos-client-ip": "9.9.9.9" })).status).toBe(202);
    expect((await post({ agent: AGENT }, { "x-xargos-client-ip": "8.8.8.8" })).status).toBe(429);
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

describe("limits of POST /demo/setup (P0-1, P1-6)", () => {
  const other = "Vote111111111111111111111111111111111111111";

  it("counts wrong access codes, so 20 guesses end in RATE_LIMITED", async () => {
    const { post } = setup({ accessCode: "secret-code", limit: 5 });
    const codes: number[] = [];
    for (let i = 0; i < 20; i++) {
      codes.push((await post({ agent: AGENT, accessCode: `guess-${i}` })).status);
    }
    expect(codes.slice(0, 5).every((status) => status === 403)).toBe(true);
    expect(codes.slice(5).every((status) => status === 429)).toBe(true);
  });

  it("caps setups across every client, on top of the limit per IP", async () => {
    const { post } = setup({ accessCode: "c", global: 1 });
    const send = (agent: string, ip: string) =>
      post({ agent, accessCode: "c" }, { "x-xargos-client-ip": ip });
    expect((await send(AGENT, "1.1.1.1")).status).toBe(202);
    expect((await send(other, "2.2.2.2")).status).toBe(429);
  });

  it("does not use up the global cap by polling the same running setup", async () => {
    const never = () => new Promise<void>(() => {});
    const { post } = setup({ global: 1, steps: steps({ fundSol: never }) });
    expect((await post({ agent: AGENT })).status).toBe(202);
    expect((await post({ agent: AGENT })).status).toBe(202);
  });

  it("refuses a new setup with a clear error when the payer is short of funds", async () => {
    const { post, jobs } = setup({ hasFunds: async () => false });
    const res = await post({ agent: AGENT });
    expect(res.status).toBe(500);
    expect((await errorBody(res)).error.code).toBe("SETUP_FAILED");
    expect(jobs.get(AGENT)).toBeUndefined();
  });
});

describe("retrying a failed setup", () => {
  it("runs it again for the same agent and ends ready", async () => {
    let attempt = 0;
    const { app, post } = setup({
      steps: steps({
        fundSol: async () => {
          attempt += 1;
          if (attempt === 1) throw new Error("first attempt fails");
        },
      }),
    });
    await post({ agent: AGENT });
    await vi.waitFor(async () => {
      const body = DemoSetupStatus.parse(await (await app.request(`/demo/setup/${AGENT}`)).json());
      expect(body.phase).toBe("failed");
    });

    expect((await post({ agent: AGENT })).status).toBe(202);
    await vi.waitFor(async () => {
      const body = DemoSetupStatus.parse(await (await app.request(`/demo/setup/${AGENT}`)).json());
      expect(body.phase).toBe("ready");
    });
    expect(attempt).toBe(2);
  });
});

describe("GET /demo/setup/:agent", () => {
  /** Un setup que ya llegó a ready, con la comprobación de la posición que se pida. */
  async function readyJob(positionIsOpen: SetupSteps["positionIsOpen"]) {
    const ctx = setup({ steps: steps({ positionIsOpen }) });
    await ctx.post({ agent: AGENT });
    await vi.waitFor(() => expect(ctx.jobs.get(AGENT)?.phase).toBe("ready"));
    return ctx;
  }

  it("reports a ready job whose position was already used as failed", async () => {
    const { app } = await readyJob(async () => false);
    const body = DemoSetupStatus.parse(await (await app.request(`/demo/setup/${AGENT}`)).json());
    expect(body.phase).toBe("failed");
    expect(body.error?.code).toBe("SETUP_FAILED");
  });

  it("lets the client start again after a used position, with the same agent", async () => {
    const { app, post } = await readyJob(async () => false);
    await app.request(`/demo/setup/${AGENT}`);
    expect((await post({ agent: AGENT })).status).toBe(202);
    await vi.waitFor(async () => {
      const body = await (await app.request(`/demo/setup/${AGENT}`)).json();
      expect(DemoSetupStatus.parse(body).phase).not.toBe("ready");
    });
  });

  it("keeps a ready job whose position is still open", async () => {
    const { app } = await readyJob(async () => true);
    const body = DemoSetupStatus.parse(await (await app.request(`/demo/setup/${AGENT}`)).json());
    expect(body.phase).toBe("ready");
  });

  it("keeps the job as it is when the position check fails", async () => {
    const { app } = await readyJob(async () => {
      throw new Error("rpc down");
    });
    const res = await app.request(`/demo/setup/${AGENT}`);
    expect(res.status).toBe(200);
    expect(DemoSetupStatus.parse(await res.json()).phase).toBe("ready");
  });

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
    expect((await app.request(`/demo/setup/${AGENT}`)).status).toBe(404);
  });
});
