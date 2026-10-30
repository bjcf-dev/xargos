import { randomUUID } from "node:crypto";
import type { Rpc, SolanaRpcApi } from "@solana/kit";
import type { FacilitatorClient } from "@x402/core/server";
import { x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { BuildRequest } from "@xargos/shared";
import { Hono } from "hono";
import type { Logger } from "../demo/setup-runner";
import { errorResponse } from "../http/errors";
import type { Recipe } from "../recipes/types";
import { buildResponse } from "../solana/build-transaction";
import type { BuildStore } from "../store/build-store";

export type RecipeRoutesDeps = {
  recipes: Recipe[];
  rpc: Rpc<SolanaRpcApi>;
  store: BuildStore;
  facilitator: FacilitatorClient;
  /** Address that receives the x402 payments. */
  payTo: string;
  /** Price in dollars for the x402 middleware, e.g. "$0.01". */
  price: string;
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
  log,
}: RecipeRoutesDeps) {
  const app = new Hono();
  const server = registerExactSvmScheme(new x402ResourceServer(facilitator), {
    networks: [SOLANA_DEVNET_CAIP2],
  });

  app.use(
    paymentMiddleware(
      Object.fromEntries(
        recipes.map((recipe) => [
          `POST /recipes/${recipe.info.id}/build`,
          {
            accepts: { scheme: "exact", price, network: SOLANA_DEVNET_CAIP2, payTo },
            description: recipe.info.name,
          },
        ]),
      ),
      server,
    ),
  );

  app.get("/recipes", (c) => c.json(recipes.map((recipe) => recipe.info)));

  app.post("/recipes/:id/build", async (c) => {
    const recipe = recipes.find((r) => r.info.id === c.req.param("id"));
    if (!recipe) return errorResponse(c, "VALIDATION_ERROR", "Unknown recipe");
    const body = BuildRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid build request");

    const buildId = `bld_${randomUUID()}`;
    try {
      const response = await buildResponse({
        recipe,
        context: { agent: body.data.agent as never, position: body.data.position as never },
        buildId,
        rpc,
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
        agent: body.data.agent,
        position: body.data.position,
        // The PAYMENT-RESPONSE receipt only exists after the middleware settles, which happens
        // once this handler returns. B13 (free rebuild) needs it: attach it there.
      });
      return c.json(response);
    } catch (error) {
      log?.error({ buildId, error: String(error) }, "build failed");
      return errorResponse(c, "BUILD_FAILED", "The recipe could not be built");
    }
  });

  return app;
}

const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;
