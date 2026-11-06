// @vitest-environment node
import { type FundQuoteRequest, type FundStatus, fixtureFundAssets } from "@xargos/shared";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import { createFundHandlers } from "./fund-handlers";

const server = setupServer();
const api = createApiClient({ baseUrl: "http://localhost/api/xargos" });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const USDC_BASE = fixtureFundAssets.origins.find(
  (o) => o.symbol === "USDC" && o.blockchain === "base",
);
if (!USDC_BASE) throw new Error("the fixture has no USDC on Base");

const request = (units: string, dry = false): FundQuoteRequest => ({
  originAsset: USDC_BASE.assetId,
  amount: String(BigInt(Math.round(Number(units) * 1e6))),
  recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  refundTo: "0x1111111111111111111111111111111111111111",
  dry,
});

/** Las primeras `n` respuestas de estado de un depósito ("503" si la consulta falla). */
async function statuses(address: string, n: number): Promise<(FundStatus | "503")[]> {
  const seen: (FundStatus | "503")[] = [];
  for (let i = 0; i < n; i++) {
    try {
      seen.push((await api.fundStatus(address)).status);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "FUND_UNAVAILABLE") seen.push("503");
      else throw error;
    }
  }
  return seen;
}

async function deposit(units: string) {
  const quote = await api.fundQuote(request(units));
  if (!quote.depositAddress) throw new Error("no deposit address");
  return { quote, address: quote.depositAddress };
}

describe("fund mock handlers", () => {
  it("lists the origins of the fixture", async () => {
    server.resetHandlers(...createFundHandlers());
    await expect(api.fundAssets()).resolves.toEqual(fixtureFundAssets);
  });

  it("prices a dry request without a deposit address", async () => {
    server.resetHandlers(...createFundHandlers());
    const quote = await api.fundQuote(request("5", true));
    expect(quote.dry).toBe(true);
    expect(quote.depositAddress).toBeUndefined();
    expect(quote.amountIn).toBe("5000000");
  });

  // Como la ruta de #101 con AURORA_MIN_USD=5: fuera de 5–25 $ responde VALIDATION_ERROR.
  it.each(["4.98", "26"])("refuses %s USDC like the backend would", async (units) => {
    server.resetHandlers(...createFundHandlers());
    await expect(api.fundQuote(request(units, true))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "The amount must be worth between 5 and 25 USD",
    });
  });

  // Como #136: en céntimos. Aurora pone el USDC a 0,9994 $ y 5 USDC justos siguen valiendo 5,00 $.
  it.each(["5", "25"])("accepts exactly %s USDC, counted in cents", async (units) => {
    const cheap = fixtureFundAssets.origins.map((o) =>
      o.assetId === USDC_BASE.assetId ? { ...o, priceUsd: 0.999429 } : o,
    );
    server.resetHandlers(...createFundHandlers({ origins: cheap }));
    await expect(api.fundQuote(request(units, true))).resolves.toMatchObject({ dry: true });
  });

  it("gives each real request its own address and send-by time", async () => {
    server.resetHandlers(...createFundHandlers());
    const a = await deposit("5");
    const b = await deposit("5");
    expect(a.address).not.toBe(b.address);
    expect(a.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(Date.parse(a.quote.deadline ?? "")).toBeGreaterThan(Date.now());
  });

  it("answers the first check in the short form", async () => {
    server.resetHandlers(...createFundHandlers());
    const { address } = await deposit("5");
    const first = await api.fundStatus(address);
    expect(first).toEqual({
      depositAddress: address,
      status: "PENDING_DEPOSIT",
      originTxs: [],
      destinationTxs: [],
    });
  });

  it.each<[string, (FundStatus | "503")[]]>([
    [
      "5",
      [
        "PENDING_DEPOSIT",
        "PENDING_DEPOSIT",
        "KNOWN_DEPOSIT_TX",
        "PROCESSING",
        "PROCESSING",
        "SUCCESS",
        "SUCCESS",
      ],
    ],
    [
      "6",
      [
        "PENDING_DEPOSIT",
        "INCOMPLETE_DEPOSIT",
        "INCOMPLETE_DEPOSIT",
        "INCOMPLETE_DEPOSIT",
        "REFUNDED",
        "REFUNDED",
      ],
    ],
    ["7", ["PENDING_DEPOSIT", "PENDING_DEPOSIT", "PENDING_DEPOSIT", "PENDING_DEPOSIT"]],
    ["8", ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "REFUNDED", "REFUNDED"]],
    ["9", ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "FAILED", "FAILED"]],
    [
      "10",
      [
        "503",
        "PENDING_DEPOSIT",
        "PENDING_DEPOSIT",
        "KNOWN_DEPOSIT_TX",
        "PROCESSING",
        "PROCESSING",
        "SUCCESS",
      ],
    ],
    [
      "12.5",
      [
        "PENDING_DEPOSIT",
        "PENDING_DEPOSIT",
        "KNOWN_DEPOSIT_TX",
        "PROCESSING",
        "PROCESSING",
        "SUCCESS",
      ],
    ],
  ])("plays scenario %s USDC", async (units, expected) => {
    server.resetHandlers(...createFundHandlers());
    const { address } = await deposit(units);
    expect(await statuses(address, expected.length)).toEqual(expected);
  });

  it("gives the expiring scenario a short window to send", async () => {
    server.resetHandlers(...createFundHandlers({ sendWindowMs: 5_000 }));
    const { quote } = await deposit("7");
    const left = Date.parse(quote.deadline ?? "") - Date.now();
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(5_000);
  });

  it("fills an incomplete deposit and its refund with consistent amounts", async () => {
    server.resetHandlers(...createFundHandlers());
    const { address } = await deposit("6");
    await api.fundStatus(address);
    const incomplete = await api.fundStatus(address);
    expect(incomplete).toMatchObject({ amountIn: "6000000", depositedAmount: "4500000" });
    await api.fundStatus(address);
    await api.fundStatus(address);
    const refunded = await api.fundStatus(address);
    expect(refunded).toMatchObject({
      status: "REFUNDED",
      depositedAmount: "4500000",
      refundedAmount: "4500000",
    });
    expect(refunded.originTxs.length).toBeGreaterThan(0);
  });

  it("still answers for an address it does not know, after a page reload", async () => {
    server.resetHandlers(...createFundHandlers());
    const { address } = await deposit("8");
    server.resetHandlers(...createFundHandlers());
    expect(await statuses(address, 3)).toEqual(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "REFUNDED"]);
  });

  // Como #136: Aurora no conoce la dirección (p. ej. un localStorage viejo) → NOT_FOUND.
  it("answers NOT_FOUND for an address that is not one of its scenarios", async () => {
    server.resetHandlers(...createFundHandlers());
    await expect(
      api.fundStatus("0x2000000000000000000000000000000000000001"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
