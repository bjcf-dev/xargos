import { SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { describe, expect, it } from "vitest";
import { AGENT, setup } from "./recipe-test-kit";

const expectNothingBuiltNorCharged = (s: ReturnType<typeof setup>) => {
  expect(s.calls.build).toBe(0);
  expect(s.calls.settle).toBe(0);
  expect(s.store.size).toBe(0);
};

describe("failed payments on POST /recipes/:id/build", () => {
  it("rejects a payment the facilitator finds invalid: 402, nothing built or settled", async () => {
    const s = setup({
      verify: async () => ({ isValid: false, invalidReason: "invalid_exact_svm_payload" }),
    });
    const res = await s.postPaid();
    expect(res.status).toBe(402);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    expect(s.calls.verify).toBeGreaterThan(0);
    expectNothingBuiltNorCharged(s);
  });

  it("rejects a payment for a smaller amount than the price", async () => {
    const s = setup();
    const res = await s.postPaid((accepted) => ({ ...accepted, amount: "1" }));
    expect(res.status).toBe(402);
    expectNothingBuiltNorCharged(s);
  });

  it("rejects a payment addressed to someone else", async () => {
    const s = setup();
    const res = await s.postPaid((accepted) => ({ ...accepted, payTo: AGENT }));
    expect(res.status).toBe(402);
    expectNothingBuiltNorCharged(s);
  });

  it("rejects a malformed PAYMENT-SIGNATURE header", async () => {
    const s = setup();
    const res = await s.post({ "PAYMENT-SIGNATURE": "not-base64-json" });
    expect(res.status).toBe(402);
    expectNothingBuiltNorCharged(s);
  });

  it("never builds when the facilitator is down", async () => {
    const s = setup({
      verify: async () => {
        throw new Error("facilitator unreachable https://rpc.example/?api-key=SECRET");
      },
    });
    const res = await s.postPaid();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toContain("SECRET");
    expectNothingBuiltNorCharged(s);
  });

  it("does not hand over the transaction when the settlement fails", async () => {
    const s = setup({
      settle: async () => ({
        success: false,
        errorReason: "insufficient_funds",
        transaction: "",
        network: SOLANA_DEVNET_CAIP2,
      }),
    });
    const res = await s.postPaid();
    expect(res.status).toBe(402);
    expect(await res.json()).not.toHaveProperty("transaction");
    expect(s.calls.settle).toBe(1);
    expect(s.store.size).toBe(0);
  });
});
