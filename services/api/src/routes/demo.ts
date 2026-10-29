import { timingSafeEqual } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Address, DemoSetupRequest } from "@xargos/shared";
import type { Context } from "hono";
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

/** Header the Netlify proxy (F5) uses to pass the real browser IP. Only the proxy knows the access code. */
export const CLIENT_IP_HEADER = "x-xargos-client-ip";

/**
 * Who to count in the rate limit. x-forwarded-for is set by the client and can be forged, so it is
 * never used. The proxy's header is trusted only with a valid access code; otherwise it is the
 * address of the connection itself.
 */
function clientKey(c: Context, trustedProxy: boolean): string {
  const forwarded = trustedProxy ? c.req.header(CLIENT_IP_HEADER)?.trim() : undefined;
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

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
    const codeIsValid = accessCode !== undefined && sameCode(body.data.accessCode, accessCode);
    if (accessCode && !codeIsValid) return errorResponse(c, "ACCESS_DENIED", "Invalid access code");

    if (!limiter.allow(clientKey(c, codeIsValid)))
      return errorResponse(c, "RATE_LIMITED", "Too many setups, try later");

    const { agent } = body.data;
    // Asking again for the same agent just returns 202: the client keeps polling the same job.
    // A failed one starts over (the steps skip what is already done), so "try again" works.
    if (!jobs.get(agent)) {
      if (!jobs.create(agent))
        return errorResponse(c, "RATE_LIMITED", "The demo is full, try later");
      void runSetup(jobs, steps, agent, log);
    } else if (jobs.restart(agent)) {
      void runSetup(jobs, steps, agent, log);
    }
    return c.json({ agent }, 202);
  });

  app.get("/demo/setup/:agent", async (c) => {
    const agent = Address.safeParse(c.req.param("agent"));
    if (!agent.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid agent address");
    const job = jobs.get(agent.data);
    if (!job) return errorResponse(c, "VALIDATION_ERROR", "Unknown agent: start a setup first");
    // A ready job outlives the demo that closes its position (the agent survives reloads, D30).
    // Reported as failed, the client posts again and the steps open a new position.
    if (job.phase === "ready" && job.position) {
      try {
        if (!(await steps.positionIsOpen(agent.data, job.position))) {
          jobs.update(agent.data, {
            phase: "failed",
            error: {
              code: "SETUP_FAILED",
              message: "The demo position was already used. Start again to get a new one.",
            },
          });
        }
      } catch (error) {
        // Without the check the job stays as it was: better a stale ready than a false failure.
        log?.error({ agent: agent.data, error: String(error) }, "position check failed");
      }
    }
    return c.json(jobs.get(agent.data) ?? job);
  });

  return app;
}
