import { timingSafeEqual } from "node:crypto";
import { Address, DemoSetupRequest } from "@xargos/shared";
import { Hono } from "hono";
import { type Logger, runSetup, type SetupSteps } from "../demo/setup-runner";
import { errorResponse } from "../http/errors";
import type { RateLimiter } from "../http/rate-limit";
import type { SetupJobs } from "../store/setup-jobs";

export type DemoRoutesDeps = {
  jobs: SetupJobs;
  steps: SetupSteps;
  limiter: RateLimiter;
  /** DEMO_ACCESS_CODE. When unset, the code is not required (local development). */
  accessCode?: string | undefined;
  log?: Logger;
};

function sameCode(given: string | undefined, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createDemoRoutes({ jobs, steps, limiter, accessCode, log }: DemoRoutesDeps) {
  const app = new Hono();

  app.post("/demo/setup", async (c) => {
    const body = DemoSetupRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid setup request");
    if (accessCode && !sameCode(body.data.accessCode, accessCode)) {
      return errorResponse(c, "ACCESS_DENIED", "Invalid access code");
    }

    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!limiter.allow(ip)) return errorResponse(c, "RATE_LIMITED", "Too many setups, try later");

    const { agent } = body.data;
    // Asking again for the same agent just returns 202: the client keeps polling the same job.
    if (!jobs.get(agent)) {
      if (!jobs.create(agent))
        return errorResponse(c, "RATE_LIMITED", "The demo is full, try later");
      void runSetup(jobs, steps, agent, log);
    }
    return c.json({ agent }, 202);
  });

  app.get("/demo/setup/:agent", (c) => {
    const agent = Address.safeParse(c.req.param("agent"));
    if (!agent.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid agent address");
    const job = jobs.get(agent.data);
    if (!job) return errorResponse(c, "VALIDATION_ERROR", "Unknown agent: start a setup first");
    return c.json(job);
  });

  return app;
}
