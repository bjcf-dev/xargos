import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { PayerFunds } from "./demo/funds";
import type { SetupSteps } from "./demo/setup-runner";
import { errorResponse } from "./http/errors";
import { RateLimiter } from "./http/rate-limit";
import { createDemoRoutes } from "./routes/demo";
import { SetupJobs } from "./store/setup-jobs";

export type AppDeps = {
  /** The paid recipe routes (x402), built in index.ts with the real facilitator. */
  recipeRoutes: Hono;
  /** POST/GET /demo/price-shock, built in index.ts with the shared build store. */
  shockRoutes: Hono;
  steps: SetupSteps;
  accessCode?: string | undefined;
  setupRateLimitPerHour: number;
  setupMaxJobs: number;
  setupGlobalLimitPerHour?: number;
  funds?: PayerFunds;
  log?: { error(data: object, message: string): void };
};

/** The biggest legitimate body is a build request; x402 sends its payment in a header. */
const MAX_BODY_BYTES = 10 * 1024;
const HOUR_MS = 60 * 60 * 1000;

export function createApp(deps: AppDeps) {
  const app = new Hono();
  // Every failure keeps the shape of the contract: the front parses it with Zod.
  app.onError((error, c) => {
    deps.log?.error({ error: String(error) }, "unhandled error");
    return errorResponse(c, "INTERNAL", "Something went wrong");
  });
  app.notFound((c) => errorResponse(c, "NOT_FOUND", "Unknown route"));
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, "VALIDATION_ERROR", "Request body too large"),
    }),
  );

  // Railway's health check: it must answer even if the RPC is down.
  app.get("/health", async (c) =>
    c.json({ ok: true, payer: deps.funds ? await deps.funds.read() : null }),
  );
  app.route("/", deps.recipeRoutes);
  app.route("/", deps.shockRoutes);
  app.route(
    "/",
    createDemoRoutes({
      jobs: new SetupJobs(deps.setupMaxJobs),
      steps: deps.steps,
      limiter: new RateLimiter(deps.setupRateLimitPerHour, HOUR_MS),
      ...(deps.setupGlobalLimitPerHour
        ? { globalLimiter: new RateLimiter(deps.setupGlobalLimitPerHour, HOUR_MS) }
        : {}),
      ...(deps.funds ? { hasFunds: deps.funds.enough } : {}),
      accessCode: deps.accessCode,
      ...(deps.log ? { log: deps.log } : {}),
    }),
  );
  return app;
}
