import {
  type BuildRequest,
  type DemoSetupPhase,
  type DemoSetupStatus,
  type ErrorCode,
  fixtureBuildResponse,
  fixtureRecipe,
  fixtureSetupReady,
  fixtureShockConfirmed,
  type PriceShockStatus,
} from "@xargos/shared";
import { delay, HttpResponse, http } from "msw";

// Cualquier origen: en el navegador es el de la página; en tests, el que use el cliente.
const API = "*/api/xargos";

const SETUP_PHASES: DemoSetupPhase[] = [
  "queued",
  "funding_sol",
  "funding_usdc",
  "opening_position",
  "ready",
];

// Ventanas del mock: lo justo para ver caducidad y rebuild sin esperar mucho.
const EXPIRES_IN_MS = 60_000;
const REBUILD_WINDOW_MS = 120_000;

const apiError = (status: number, code: ErrorCode, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

/**
 * Handlers MSW con las fixtures de @xargos/shared. Sin x402: el build responde
 * 200 directamente (el pago real llega en F8). El estado vive en esta closure.
 */
export function createHandlers({ latencyMs = 0 }: { latencyMs?: number } = {}) {
  const setupPolls = new Map<string, number>();
  const shockPolls = new Map<string, number>();
  let builds = 0;
  let shocks = 0;

  const wait = () => (latencyMs > 0 ? delay(latencyMs) : Promise.resolve());

  return [
    http.get(`${API}/recipes`, async () => {
      await wait();
      return HttpResponse.json([fixtureRecipe]);
    }),

    http.post<{ recipeId: string }, BuildRequest>(
      `${API}/recipes/:recipeId/build`,
      async ({ params, request }) => {
        await wait();
        if (params.recipeId !== fixtureRecipe.id) {
          return apiError(400, "VALIDATION_ERROR", `Unknown recipe "${params.recipeId}"`);
        }
        const { agent } = await request.json();
        const now = Date.now();
        builds++;
        return HttpResponse.json({
          ...fixtureBuildResponse,
          buildId: `bld_mock_${builds}`,
          expiresAt: new Date(now + EXPIRES_IN_MS).toISOString(),
          rebuildUntil: new Date(now + REBUILD_WINDOW_MS).toISOString(),
          watchAccounts: [agent],
        });
      },
    ),

    http.post<never, { agent: string }>(`${API}/demo/setup`, async ({ request }) => {
      await wait();
      const { agent } = await request.json();
      setupPolls.set(agent, 0);
      return HttpResponse.json({ agent }, { status: 202 });
    }),

    http.get<{ agent: string }>(`${API}/demo/setup/:agent`, async ({ params }) => {
      await wait();
      const polls = setupPolls.get(params.agent);
      if (polls === undefined) {
        return apiError(400, "VALIDATION_ERROR", "Setup was never started for this agent");
      }
      setupPolls.set(params.agent, polls + 1);
      const phase = SETUP_PHASES[Math.min(polls, SETUP_PHASES.length - 1)] ?? "ready";
      const status: DemoSetupStatus =
        phase === "ready"
          ? { ...fixtureSetupReady, agent: params.agent }
          : { agent: params.agent, phase };
      return HttpResponse.json(status);
    }),

    http.post(`${API}/demo/price-shock`, async () => {
      await wait();
      shocks++;
      const shockId = `shk_mock_${shocks}`;
      shockPolls.set(shockId, 0);
      return HttpResponse.json({ shockId }, { status: 202 });
    }),

    http.get<{ shockId: string }>(`${API}/demo/price-shock/:shockId`, async ({ params }) => {
      await wait();
      const polls = shockPolls.get(params.shockId);
      if (polls === undefined) {
        return apiError(400, "VALIDATION_ERROR", `Unknown shock "${params.shockId}"`);
      }
      shockPolls.set(params.shockId, polls + 1);
      const status: PriceShockStatus =
        polls === 0
          ? { shockId: params.shockId, status: "pending" }
          : { ...fixtureShockConfirmed, shockId: params.shockId };
      return HttpResponse.json(status);
    }),
  ];
}
