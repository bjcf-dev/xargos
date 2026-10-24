import type { FacilitatorClient } from "@x402/core/server";
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { describe, expect, it } from "vitest";
import { createSpikeApp } from "./app.js";

const PAYER = "A3zwodWASq2rCTSwjiRvzrRMNKLEP7bMwC3azd4X5nDj";
const PAY_TO = "3NxLt5rLgsT46ngFjUj2VQhsfhu1miEmARUTS8gN1MYw";
const FEE_PAYER = "3qybJ9ApEBWun7xvbnrVJ6NfDpvRGTBbppfxaFENe6SC";

function fakeFacilitator() {
  const calls = { verify: 0, settle: 0 };
  const facilitator: FacilitatorClient = {
    verify: async () => {
      calls.verify++;
      return { isValid: true, payer: PAYER };
    },
    settle: async () => {
      calls.settle++;
      return {
        success: true,
        transaction: "fake-signature",
        network: SOLANA_DEVNET_CAIP2,
        payer: PAYER,
      };
    },
    getSupported: async () => ({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          extra: { feePayer: FEE_PAYER },
        },
      ],
      extensions: [],
      signers: {},
    }),
  };
  return { facilitator, calls };
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");

async function pay(app: ReturnType<typeof createSpikeApp>) {
  const first = await app.request("/paid");
  expect(first.status).toBe(402);
  const required = JSON.parse(
    Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(),
  );
  const payload = {
    x402Version: 2,
    resource: required.resource,
    accepted: required.accepts[0],
    payload: {},
  };
  return app.request("/paid", { headers: { "PAYMENT-SIGNATURE": b64(payload) } });
}

describe("x402 middleware settlement (spike B2)", () => {
  it("settles after a 2xx handler", async () => {
    const { facilitator, calls } = fakeFacilitator();
    const app = createSpikeApp({
      facilitator,
      payTo: PAY_TO,
      work: () => Response.json({ ok: true }),
    });
    const res = await pay(app);
    expect(res.status).toBe(200);
    expect(calls).toEqual({ verify: 1, settle: 1 });
  });

  it("does NOT settle when the handler answers 500", async () => {
    const { facilitator, calls } = fakeFacilitator();
    const app = createSpikeApp({
      facilitator,
      payTo: PAY_TO,
      work: () => new Response("boom", { status: 500 }),
    });
    const res = await pay(app);
    expect(res.status).toBe(500);
    expect(calls).toEqual({ verify: 1, settle: 0 });
  });

  it("does NOT settle when the handler throws", async () => {
    const { facilitator, calls } = fakeFacilitator();
    const app = createSpikeApp({
      facilitator,
      payTo: PAY_TO,
      work: () => {
        throw new Error("boom");
      },
    });
    const res = await pay(app);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(calls.settle).toBe(0);
  });
});
