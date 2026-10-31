import { Hono } from "hono";
import type { SetupSteps } from "./demo/setup-runner";
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
  log?: { error(data: object, message: string): void };
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/", deps.recipeRoutes);
  app.route("/", deps.shockRoutes);
  app.route(
    "/",
    createDemoRoutes({
      jobs: new SetupJobs(deps.setupMaxJobs),
      steps: deps.steps,
      limiter: new RateLimiter(deps.setupRateLimitPerHour, 60 * 60 * 1000),
      accessCode: deps.accessCode,
      ...(deps.log ? { log: deps.log } : {}),
    }),
  );
  return app;
}
