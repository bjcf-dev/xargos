// End to end against a RUNNING api (pnpm start): a new agent goes through setup, pays the recipe
// with real x402, optionally takes a price shock (DEMO=B), and signs the tx itself. Run:
//   DEMO=A|B API_URL=http://localhost:8799 DEMO_ACCESS_CODE=... pnpm --filter @xargos/api demo:full
import {
  createSolanaRpc,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  signTransaction,
} from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { toClientSvmSigner } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { BuildResponse, DemoSetupStatus, PriceShockStatus } from "@xargos/shared";
import { explorerTx, RPC_URL } from "./orca/common";

const API = process.env.API_URL ?? "http://localhost:8799";
const CODE = process.env.DEMO_ACCESS_CODE;
const DEMO = process.env.DEMO === "B" ? "B" : "A";
const RECIPE = "exit-orca-lp-to-usdc";
const t0 = Date.now();
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(
  read: () => Promise<T>,
  done: (v: T) => boolean,
  label: string,
): Promise<T> {
  for (let i = 0; i < 90; i++) {
    const v = await read();
    if (done(v)) return v;
    await sleep(1000);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const agent = await generateKeyPairSigner();
console.log(`demo ${DEMO}, agent ${agent.address}`);

// 1. Setup (the backend funds the agent; it only learns the public key).
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const setupRes = await post("/demo/setup", {
  agent: agent.address,
  ...(CODE ? { accessCode: CODE } : {}),
});
console.log(at(), "setup accepted:", setupRes.status);
const setup = await until(
  async () =>
    DemoSetupStatus.parse(await (await fetch(`${API}/demo/setup/${agent.address}`)).json()),
  (s) => s.phase === "ready" || s.phase === "failed",
  "setup",
);
console.log(at(), "setup", setup.phase, "balances", setup.balances);
if (setup.phase !== "ready" || !setup.position) throw new Error("setup failed");

// 2. Pay with x402 and build (verify -> build -> simulate -> settle).
const client = new x402Client();
registerExactSvmScheme(client, { signer: toClientSvmSigner(agent) });
const paying = wrapFetchWithPayment(fetch, client);
const buildRes = await paying(`${API}/recipes/${RECIPE}/build`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ agent: agent.address, position: setup.position }),
});
const settle = buildRes.headers.get("PAYMENT-RESPONSE");
const receipt = settle ? JSON.parse(Buffer.from(settle, "base64").toString()) : null;
console.log(
  at(),
  "build",
  buildRes.status,
  "settled:",
  receipt?.success,
  receipt ? explorerTx(receipt.transaction) : "",
);
if (!buildRes.ok) throw new Error(`build failed: ${await buildRes.text()}`);
const build = BuildResponse.parse(await buildRes.json());
console.log(at(), "minDelta", build.guard.minDelta, "expectedOut", build.quote.expectedOut);

// 3. Demo B: move the pool between the quote and the execution.
if (DEMO === "B") {
  // The pool may still be recovering from the previous shock (429): wait for it.
  let shockRes = await post(
    "/demo/price-shock",
    { agent: agent.address },
    CODE ? { "x-xargos-access-code": CODE } : {},
  );
  for (let i = 0; shockRes.status === 429 && i < 60; i++) {
    await sleep(1000);
    shockRes = await post(
      "/demo/price-shock",
      { agent: agent.address },
      CODE ? { "x-xargos-access-code": CODE } : {},
    );
  }
  if (shockRes.status !== 202) {
    throw new Error(`price shock refused: ${shockRes.status} ${await shockRes.text()}`);
  }
  const { shockId } = (await shockRes.json()) as { shockId: string };
  const shock = await until(
    async () =>
      PriceShockStatus.parse(await (await fetch(`${API}/demo/price-shock/${shockId}`)).json()),
    (s) => s.status !== "pending",
    "shock",
  );
  console.log(at(), "shock", shock.status, shock.priceBefore, "->", shock.priceAfter);
}

// 4. The agent signs and sends. Demo B has to land to show the revert, so no preflight.
const rpc = createSolanaRpc(RPC_URL);
const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(build.transaction));
const signed = await signTransaction([agent.keyPair], decoded);
const signature = getSignatureFromTransaction(signed);
await rpc
  .sendTransaction(getBase64EncodedWireTransaction(signed), {
    encoding: "base64",
    skipPreflight: DEMO === "B",
  })
  .send();
const status = await until(
  async () => (await rpc.getSignatureStatuses([signature]).send()).value[0],
  (s) =>
    s?.confirmationStatus === "confirmed" ||
    s?.confirmationStatus === "finalized" ||
    s?.err != null,
  "confirmation",
);
const tx = await rpc
  .getTransaction(signature, { maxSupportedTransactionVersion: 0, encoding: "json" })
  .send();
const logs = tx?.meta?.logMessages ?? [];
console.log(at(), status?.err ? "REVERTED" : "CONFIRMED", explorerTx(signature));
console.log("GUARD_FAIL log:", logs.find((l) => l.includes("GUARD_FAIL")) ?? "none");
