import { randomUUID } from "node:crypto";
import type { Rpc, SolanaRpcApi } from "@solana/kit";
import type { FacilitatorClient } from "@x402/core/server";
import { x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { BuildRequest } from "@xargos/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Logger } from "../demo/setup-runner";
import { errorResponse } from "../http/errors";
import type { Recipe } from "../recipes/types";
import { buildResponse } from "../solana/build-transaction";
import type { BuildStore, StoredBuild } from "../store/build-store";

export type RecipeRoutesDeps = {
  recipes: Recipe[];
  rpc: Rpc<SolanaRpcApi>;
  store: BuildStore;
  facilitator: FacilitatorClient;
  /** Address that receives the x402 payments. */
  payTo: string;
  /** Price in dollars for the x402 middleware, e.g. "$0.01". */
  price: string;
  /**
   * Public base URL of the API as the agent sees it (the Netlify proxy). Without it x402 uses the
   * URL of the request that reaches this server, which behind a proxy is not the one the agent paid for.
   */
  publicUrl?: string | undefined;
  log?: Logger;
};

/**
 * POST /recipes/:id/build: x402 verifies the payment first (D17), the handler builds and simulates,
 * and the middleware settles only if the handler answers below 400. So a failed build or a failed
 * simulation never charges the agent.
 */
export function createRecipeRoutes({
  recipes,
  rpc,
  store,
  facilitator,
  payTo,
  price,
  publicUrl,
  log,
}: RecipeRoutesDeps) {
  const app = new Hono();
  const server = registerExactSvmScheme(new x402ResourceServer(facilitator), {
    networks: [SOLANA_DEVNET_CAIP2],
  });
  const recipeById = (id: string) => recipes.find((r) => r.info.id === id);
  /** The build of a paid request, until the middleware says whether the payment settled. */
  const unsettled = new WeakMap<Request, string>();

  /** Builds and simulates. `rebuildOf` is the first build when this is a free rebuild (D19). */
  async function build(c: Context, recipe: Recipe, request: BuildRequest, rebuildOf?: StoredBuild) {
    const buildId = rebuildOf?.response.buildId ?? `bld_${randomUUID()}`;
    let quoteSqrtPrice = rebuildOf?.quoteSqrtPrice;
    try {
      const response = await buildResponse({
        recipe,
        context: {
          agent: request.agent as never,
          position: request.position as never,
          // A rebuild keeps the promise of the first payment: the same expectedOut and minDelta
          // (lesson 10), so a price move between builds cannot loosen the guard.
          ...(rebuildOf
            ? {
                fixed: {
                  expectedOut: BigInt(rebuildOf.response.quote.expectedOut),
                  minDelta: BigInt(rebuildOf.response.guard.minDelta),
                },
              }
            : {}),
        },
        buildId,
        rpc,
        // A rebuild keeps the price of the first quote; a new build records its own.
        onBuilt: (built) => {
          quoteSqrtPrice ??= built.quoteSqrtPrice;
        },
        // ...and the window of the first build, it does not restart.
        ...(rebuildOf ? { rebuildUntil: new Date(rebuildOf.response.rebuildUntil) } : {}),
      });

      // Simulate before settling: a transaction that would fail must not cost the agent a payment.
      const simulation = await rpc
        .simulateTransaction(response.transaction as never, {
          encoding: "base64",
          sigVerify: false,
          replaceRecentBlockhash: true,
        })
        .send();
      if (simulation.value.err) {
        log?.error(
          { buildId, err: JSON.stringify(simulation.value.err, bigintReplacer) },
          "build simulation failed",
        );
        return errorResponse(c, "BUILD_FAILED", "The transaction did not pass the simulation");
      }

      store.put({
        response,
        agent: request.agent,
        position: request.position,
        quoteSqrtPrice,
        paymentResponse: rebuildOf?.paymentResponse,
      });
      if (!rebuildOf) unsettled.set(c.req.raw, buildId);
      return c.json(response);
    } catch (error) {
      log?.error({ buildId, error: String(error) }, "build failed");
      return errorResponse(c, "BUILD_FAILED", "The recipe could not be built");
    }
  }

  // Free rebuild (D19). It goes BEFORE the payment middleware: with a buildId still inside its
  // window nobody verifies or settles a payment. Anything else falls through to the paid route.
  app.post("/recipes/:id/build", async (c, next) => {
    const recipe = recipeById(c.req.param("id"));
    const request = BuildRequest.safeParse(
      await c.req.raw
        .clone()
        .json()
        .catch(() => null),
    );
    if (!recipe || !request.success || !request.data.buildId) return next();

    const stored = store.get(request.data.buildId);
    const sameBuild =
      stored !== undefined &&
      stored.response.recipeId === recipe.info.id &&
      stored.agent === request.data.agent &&
      stored.position === request.data.position;
    // Unknown, expired or somebody else's build: the same answer, and no charge.
    if (!stored || !sameBuild) {
      return errorResponse(c, "REBUILD_WINDOW_CLOSED", "The free rebuild window is closed");
    }
    return build(c, recipe, request.data, stored);
  });

  // Outside the payment middleware: it settles after the handler, so only here is the outcome
  // known. Without a settled payment the build goes away, and with it the rebuild and the shock.
  app.post("/recipes/:id/build", async (c, next) => {
    await next();
    const buildId = unsettled.get(c.req.raw);
    if (!buildId) return;
    const receipt = c.res.headers.get("PAYMENT-RESPONSE");
    if (c.res.ok && receipt) store.confirmPayment(buildId, receipt);
    else store.delete(buildId);
  });

  app.use(
    paymentMiddleware(
      Object.fromEntries(
        recipes.map((recipe) => [
          `POST /recipes/${recipe.info.id}/build`,
          {
            accepts: { scheme: "exact", price, network: SOLANA_DEVNET_CAIP2, payTo },
            description: recipe.info.name,
            ...(publicUrl && {
              resource: `${publicUrl.replace(/\/+$/, "")}/recipes/${recipe.info.id}/build`,
            }),
          },
        ]),
      ),
      server,
    ),
  );

  app.get("/recipes", (c) => c.json(recipes.map((recipe) => recipe.info)));

  app.post("/recipes/:id/build", async (c) => {
    const recipe = recipeById(c.req.param("id"));
    if (!recipe) return errorResponse(c, "NOT_FOUND", "Unknown recipe");
    const request = BuildRequest.safeParse(await c.req.json().catch(() => null));
    if (!request.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid build request");
    return build(c, recipe, request.data);
  });

  return app;
}

const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;
