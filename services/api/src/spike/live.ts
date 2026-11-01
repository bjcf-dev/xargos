// Live devnet spike: self-facilitated x402 payment of 0.01 USDC.
// Run: pnpm --filter @xargos/api spike:live   (keys come from ~/.config/xargos, never printed)
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { wrapFetchWithPayment } from "@x402/fetch";
import { SOLANA_DEVNET_CAIP2, toClientSvmSigner, toFacilitatorSvmSigner } from "@x402/svm";
import { registerExactSvmScheme as registerClient } from "@x402/svm/exact/client";
import { registerExactSvmScheme as registerFacilitator } from "@x402/svm/exact/facilitator";
import { asFacilitatorClient } from "../payment/local-facilitator.js";
import { createSpikeApp } from "./app.js";

const keyFile = (name: string) => join(homedir(), ".config", "xargos", `${name}-keypair.json`);
const load = (name: string) =>
  createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(keyFile(name), "utf8"))));

const [facilitatorKey, agentKey, paytoKey] = await Promise.all([
  load("facilitator"),
  load("agent"),
  load("payto"),
]);

const facilitator = new x402Facilitator();
registerFacilitator(facilitator, {
  signer: toFacilitatorSvmSigner(facilitatorKey),
  networks: SOLANA_DEVNET_CAIP2,
});

const app = createSpikeApp({
  facilitator: asFacilitatorClient(facilitator),
  payTo: paytoKey.address,
  work: () => Response.json({ ok: true, at: new Date().toISOString() }),
});
const server = serve({ fetch: app.fetch, port: 8787 });

const client = new x402Client();
registerClient(client, { signer: toClientSvmSigner(agentKey) });
const payingFetch = wrapFetchWithPayment(fetch, client);

try {
  const res = await payingFetch("http://localhost:8787/paid");
  console.log("status:", res.status, "body:", await res.text());
  if (res.status === 402) {
    const req = res.headers.get("PAYMENT-REQUIRED");
    console.log(
      "payment-required:",
      req ? Buffer.from(req, "base64").toString() : "(sin cabecera)",
    );
  }
  const header = res.headers.get("PAYMENT-RESPONSE");
  if (header) {
    const settle = JSON.parse(Buffer.from(header, "base64").toString());
    console.log("settled:", settle.success, "network:", settle.network);
    console.log(`explorer: https://explorer.solana.com/tx/${settle.transaction}?cluster=devnet`);
  } else {
    console.log("sin cabecera PAYMENT-RESPONSE");
  }
} catch (error) {
  console.log("error:", error instanceof Error ? error.message : error);
} finally {
  server.close();
}
