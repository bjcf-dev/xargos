import type { FacilitatorClient } from "@x402/core/server";
import { x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { Hono } from "hono";

export type SpikeAppOptions = {
  facilitator: FacilitatorClient;
  payTo: string;
  /** Handler of the paid route; the status it returns decides if the payment settles. */
  work: () => Response | Promise<Response>;
};

export function createSpikeApp({ facilitator, payTo, work }: SpikeAppOptions) {
  const server = registerExactSvmScheme(new x402ResourceServer(facilitator), {
    networks: [SOLANA_DEVNET_CAIP2],
  });
  const app = new Hono();
  app.use(
    paymentMiddleware(
      {
        "GET /paid": {
          accepts: { scheme: "exact", price: "$0.01", network: SOLANA_DEVNET_CAIP2, payTo },
          description: "x402 spike: 0.01 USDC",
        },
      },
      server,
    ),
  );
  app.get("/paid", () => work());
  return app;
}
