import { randomUUID } from "node:crypto";
import { PriceShockRequest } from "@xargos/shared";
import { Hono } from "hono";
import type { Logger } from "../demo/setup-runner";
import { runShock, type ShockGate, type ShockJobs, type ShockSteps } from "../demo/shock";
import { errorResponse } from "../http/errors";
import type { RateLimiter } from "../http/rate-limit";
import type { BuildStore } from "../store/build-store";
import { clientKey, sameCode } from "./demo";

export type ShockRoutesDeps = {
  jobs: ShockJobs;
  gate: ShockGate;
  steps: ShockSteps;
  store: BuildStore;
  limiter: RateLimiter;
  cooldownMs: number;
  restoreTimeoutMs?: number;
  accessCode?: string | undefined;
  /** Test hook: lets the restore run at once instead of after the cooldown. */
  schedule?: (task: () => void, ms: number) => void;
  log?: Logger;
};

/**
 * The shock moves the pool with the payer's funds, so it is closed on three sides: the access
 * code (header, set by the proxy), a rate limit, and the agent must hold a live paid build.
 */
export function createShockRoutes(deps: ShockRoutesDeps) {
  const app = new Hono();

  app.post("/demo/price-shock", async (c) => {
    const request = PriceShockRequest.safeParse(await c.req.json().catch(() => null));
    if (!request.success)
      return errorResponse(c, "VALIDATION_ERROR", "Invalid price shock request");

    const code = c.req.header("x-xargos-access-code");
    const codeIsValid = deps.accessCode !== undefined && sameCode(code, deps.accessCode);
    if (deps.accessCode && !codeIsValid)
      return errorResponse(c, "ACCESS_DENIED", "Invalid access code");

    const build = deps.store.latestLiveBuildFor(request.data.agent);
    if (!build) {
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "Build the recipe first: the shock needs a live build",
      );
    }
    // The gate comes BEFORE the rate limit: a client that is only waiting for the pool to recover
    // must not use up its quota with every poll. Only a shock that really starts is counted.
    if (!deps.gate.tryStart()) {
      return errorResponse(c, "RATE_LIMITED", "The pool is busy or recovering, try again soon");
    }
    if (!deps.limiter.allow(clientKey(c, codeIsValid))) {
      deps.gate.release();
      return errorResponse(c, "RATE_LIMITED", "Too many price shocks, try later");
    }

    const shockId = `shk_${randomUUID()}`;
    deps.jobs.create(shockId);
    void runShock(deps.jobs, deps.gate, deps.steps, shockId, {
      cooldownMs: deps.cooldownMs,
      ...(build.quoteSqrtPrice !== undefined ? { quoteSqrtPrice: build.quoteSqrtPrice } : {}),
      ...(deps.restoreTimeoutMs ? { restoreTimeoutMs: deps.restoreTimeoutMs } : {}),
      ...(deps.schedule ? { schedule: deps.schedule } : {}),
      ...(deps.log ? { log: deps.log } : {}),
    });
    return c.json({ shockId }, 202);
  });

  app.get("/demo/price-shock/:shockId", (c) => {
    const job = deps.jobs.get(c.req.param("shockId"));
    if (!job) return errorResponse(c, "VALIDATION_ERROR", "Unknown shock");
    return c.json(job);
  });

  return app;
}
