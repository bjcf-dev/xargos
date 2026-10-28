import { Hono } from "hono";
import type { SetupSteps } from "./demo/setup-runner";
import { RateLimiter } from "./http/rate-limit";
import { createDemoRoutes } from "./routes/demo";
import { SetupJobs } from "./store/setup-jobs";

export type AppDeps = {
  steps: SetupSteps;
  accessCode?: string | undefined;
  setupRateLimitPerHour: number;
  setupMaxJobs: number;
  log?: { error(data: object, message: string): void };
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
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
