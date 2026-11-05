import type { FundQuote, FundQuoteRequest, FundStatus, FundStatusResponse } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { fundReducer, isSettled } from "./reducer";
import type { Deposit, FundEvent, FundState } from "./types";

const REQUEST: FundQuoteRequest = {
  originAsset: "nep141:base-usdc",
  amount: "2000000",
  recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  refundTo: "0x1111111111111111111111111111111111111111",
  dry: true,
};

const PREVIEW: FundQuote = {
  dry: true,
  originAsset: REQUEST.originAsset,
  destinationAsset: "nep141:sol-usdc",
  recipient: REQUEST.recipient,
  refundTo: REQUEST.refundTo,
  amountIn: "2000000",
  amountInFormatted: "2",
  amountInUsd: "2.00",
  amountOut: "1751299",
  amountOutFormatted: "1.751299",
  amountOutUsd: "1.75",
  minAmountOut: "1733786",
  withdrawFee: "248701",
  refundFee: "2400",
  timeEstimateSeconds: 40,
};

const QUOTE: FundQuote = {
  ...PREVIEW,
  dry: false,
  depositAddress: "0xdepositdepositdepositdepositdepositdepo",
  deadline: "2026-11-06T12:25:00.000Z",
  timeWhenInactive: "2026-11-06T12:30:00.000Z",
};

const DEPOSIT: Deposit = {
  depositAddress: "0xdepositdepositdepositdepositdepositdepo",
  deadline: "2026-11-06T12:25:00.000Z",
  timeWhenInactive: "2026-11-06T12:30:00.000Z",
  quote: QUOTE,
};

const status = (s: FundStatus, extra: Partial<FundStatusResponse> = {}): FundStatusResponse => ({
  depositAddress: DEPOSIT.depositAddress,
  status: s,
  originTxs: [],
  destinationTxs: [],
  ...extra,
});

const tracking = (aurora?: FundStatus): FundState => ({
  status: "tracking",
  deposit: DEPOSIT,
  ...(aurora ? { aurora, latest: status(aurora) } : {}),
});

const run = (state: FundState, ...events: FundEvent[]) => events.reduce(fundReducer, state);

describe("fundReducer: quoting", () => {
  it("asks for a dry quote from idle", () => {
    expect(
      fundReducer({ status: "idle" }, { type: "PREVIEW_REQUESTED", request: REQUEST }),
    ).toEqual({ status: "previewing", request: REQUEST });
  });

  it("shows the dry quote", () => {
    const state = run(
      { status: "idle" },
      { type: "PREVIEW_REQUESTED", request: REQUEST },
      {
        type: "PREVIEW_RECEIVED",
        preview: PREVIEW,
      },
    );
    expect(state).toEqual({ status: "previewed", request: REQUEST, preview: PREVIEW });
  });

  it("asks for the deposit address after the preview and keeps the preview", () => {
    const real = { ...REQUEST, dry: false };
    const state = fundReducer(
      { status: "previewed", request: REQUEST, preview: PREVIEW },
      { type: "DEPOSIT_REQUESTED", request: real },
    );
    expect(state).toEqual({ status: "requesting", request: real, preview: PREVIEW });
  });

  it("starts tracking with the address and both deadlines of the real quote", () => {
    const state = fundReducer(
      { status: "requesting", request: { ...REQUEST, dry: false } },
      { type: "DEPOSIT_RECEIVED", quote: QUOTE },
    );
    // Recién creada, nada ha llegado: así "sin estado" solo significa "recién recargado".
    expect(state).toEqual({ status: "tracking", deposit: DEPOSIT, aurora: "PENDING_DEPOSIT" });
  });

  it("asks for the deposit address while a price is still loading", () => {
    const real = { ...REQUEST, dry: false };
    expect(
      fundReducer(
        { status: "previewing", request: REQUEST },
        { type: "DEPOSIT_REQUESTED", request: real },
      ),
    ).toEqual({ status: "requesting", request: real });
  });

  it("replaces a price request that is still loading with the new one", () => {
    const three = { ...REQUEST, amount: "3000000" };
    expect(
      fundReducer(
        { status: "previewing", request: REQUEST },
        { type: "PREVIEW_REQUESTED", request: three },
      ),
    ).toEqual({ status: "previewing", request: three });
  });

  it("ignores a late price failure while the address is being requested", () => {
    const state: FundState = { status: "requesting", request: { ...REQUEST, dry: false } };
    const error = { code: "FUND_UNAVAILABLE" as const, message: "down" };
    expect(fundReducer(state, { type: "QUOTE_FAILED", error, dry: true })).toBe(state);
    expect(
      fundReducer(
        { status: "previewing", request: REQUEST },
        { type: "QUOTE_FAILED", error, dry: true },
      ),
    ).toEqual({ status: "error", error, request: REQUEST });
  });

  // Sin dirección no hay adónde enviar: nunca se enseña una pantalla de depósito vacía.
  it("fails a real quote that has no deposit address", () => {
    const real = { ...REQUEST, dry: false };
    const state = fundReducer(
      { status: "requesting", request: real },
      { type: "DEPOSIT_RECEIVED", quote: PREVIEW },
    );
    expect(state).toMatchObject({
      status: "error",
      request: real,
      error: { code: "FUND_UNAVAILABLE" },
    });
  });

  it("fails a quote with its error and keeps the request to try again", () => {
    const error = { code: "FUND_QUOTE_FAILED" as const, message: "Amount too low" };
    for (const from of [
      { status: "previewing", request: REQUEST },
      { status: "requesting", request: REQUEST },
    ] as FundState[]) {
      expect(fundReducer(from, { type: "QUOTE_FAILED", error })).toEqual({
        status: "error",
        error,
        request: REQUEST,
      });
    }
  });

  it("ignores a late quote failure once the deposit is being tracked", () => {
    const state = tracking("PENDING_DEPOSIT");
    expect(
      fundReducer(state, { type: "QUOTE_FAILED", error: { code: "INTERNAL", message: "x" } }),
    ).toBe(state);
  });
});

describe("fundReducer: tracking", () => {
  it("records each status Aurora reports", () => {
    const state = run(tracking(), { type: "STATUS_RECEIVED", status: status("KNOWN_DEPOSIT_TX") });
    expect(state).toEqual({
      status: "tracking",
      deposit: DEPOSIT,
      aurora: "KNOWN_DEPOSIT_TX",
      latest: status("KNOWN_DEPOSIT_TX"),
    });
  });

  it("ignores a status for another deposit address", () => {
    const state = tracking("PENDING_DEPOSIT");
    expect(
      fundReducer(state, {
        type: "STATUS_RECEIVED",
        status: { ...status("SUCCESS"), depositAddress: "0xother" },
      }),
    ).toBe(state);
  });

  it("follows an incomplete deposit to its refund", () => {
    const state = run(
      tracking("PENDING_DEPOSIT"),
      {
        type: "STATUS_RECEIVED",
        status: status("INCOMPLETE_DEPOSIT", { depositedAmount: "1000000" }),
      },
      { type: "STATUS_RECEIVED", status: status("REFUNDED", { refundReason: "Not topped up" }) },
    );
    expect(state).toMatchObject({ status: "tracking", aurora: "REFUNDED" });
    expect(isSettled(state)).toBe(true);
  });

  // Aurora puede contestar solo con `{ status }` (referencia OpenAPI, anyOf): basta con eso.
  it("accepts the short status answer without updatedAt", () => {
    const state = run(tracking(), { type: "STATUS_RECEIVED", status: status("PENDING_DEPOSIT") });
    expect(state).toMatchObject({ status: "tracking", aurora: "PENDING_DEPOSIT" });
  });

  it("keeps the deposit when a status check fails, and clears the error on the next answer", () => {
    const error = { code: "FUND_UNAVAILABLE" as const, message: "Aurora is down" };
    const failed = run(tracking("PROCESSING"), { type: "STATUS_FAILED", error });
    expect(failed).toMatchObject({ status: "tracking", aurora: "PROCESSING", lastError: error });

    const back = run(failed, { type: "STATUS_RECEIVED", status: status("SUCCESS") });
    expect(back).not.toHaveProperty("lastError");
    expect(isSettled(back)).toBe(true);
  });

  it.each(["SUCCESS", "REFUNDED", "FAILED"] as const)(
    "stops at %s: later events change nothing",
    (final) => {
      const state = tracking(final);
      expect(isSettled(state)).toBe(true);
      for (const event of [
        { type: "STATUS_RECEIVED", status: status("PROCESSING") },
        { type: "STATUS_FAILED", error: { code: "INTERNAL", message: "x" } },
        { type: "DEADLINE_PASSED" },
      ] as FundEvent[]) {
        expect(fundReducer(state, event)).toBe(state);
      }
    },
  );

  it("is not settled while Aurora is still working", () => {
    for (const s of [
      "PENDING_DEPOSIT",
      "KNOWN_DEPOSIT_TX",
      "INCOMPLETE_DEPOSIT",
      "PROCESSING",
    ] as const) {
      expect(isSettled(tracking(s))).toBe(false);
    }
    expect(isSettled(tracking())).toBe(false);
  });
});

describe("fundReducer: deadline and the last check", () => {
  it("expires when the last check after the deadline is still PENDING_DEPOSIT", () => {
    const state = run(
      tracking("PENDING_DEPOSIT"),
      { type: "DEADLINE_PASSED" },
      { type: "STATUS_RECEIVED", status: status("PENDING_DEPOSIT") },
    );
    expect(state).toEqual({
      status: "expired",
      deposit: DEPOSIT,
      latest: status("PENDING_DEPOSIT"),
    });
  });

  it("does not expire before the last check answers", () => {
    const state = run(tracking("PENDING_DEPOSIT"), { type: "DEADLINE_PASSED" });
    expect(state).toMatchObject({ status: "tracking", lastCheck: true });
  });

  it.each(["KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS"] as const)(
    "follows %s when it arrives in the last check, instead of expiring",
    (next) => {
      const state = run(
        tracking("PENDING_DEPOSIT"),
        { type: "DEADLINE_PASSED" },
        { type: "STATUS_RECEIVED", status: status(next) },
      );
      expect(state).toMatchObject({ status: "tracking", aurora: next });
      expect(state).not.toHaveProperty("lastCheck");
    },
  );

  // Un fallo de red no es un PENDING_DEPOSIT: se reintenta y sigue siendo la última consulta.
  it("retries a failed last check instead of expiring", () => {
    const failed = run(
      tracking("PENDING_DEPOSIT"),
      { type: "DEADLINE_PASSED" },
      { type: "STATUS_FAILED", error: { code: "FUND_UNAVAILABLE", message: "down" } },
    );
    expect(failed).toMatchObject({ status: "tracking", lastCheck: true });

    const state = run(failed, { type: "STATUS_RECEIVED", status: status("PENDING_DEPOSIT") });
    expect(state.status).toBe("expired");
  });

  it("ignores the deadline once a deposit is on its way", () => {
    for (const s of ["KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING"] as const) {
      const state = tracking(s);
      expect(fundReducer(state, { type: "DEADLINE_PASSED" })).toBe(state);
    }
  });

  it("makes the next answer the last check when the deadline passes before the first one", () => {
    const state = run(
      tracking(),
      { type: "DEADLINE_PASSED" },
      { type: "STATUS_RECEIVED", status: status("PENDING_DEPOSIT") },
    );
    expect(state.status).toBe("expired");
  });
});

describe("fundReducer: reload and reset", () => {
  it("restores a saved deposit from idle and waits for its first status", () => {
    expect(fundReducer({ status: "idle" }, { type: "RESTORED", deposit: DEPOSIT })).toEqual({
      status: "tracking",
      deposit: DEPOSIT,
    });
  });

  it("restores nothing over a flow already under way", () => {
    const state: FundState = { status: "previewing", request: REQUEST };
    expect(fundReducer(state, { type: "RESTORED", deposit: DEPOSIT })).toBe(state);
  });

  it.each([
    ["previewed", { status: "previewed", request: REQUEST, preview: PREVIEW }],
    ["error", { status: "error", request: REQUEST, error: { code: "INTERNAL", message: "x" } }],
    ["expired", { status: "expired", deposit: DEPOSIT }],
    ["settled", tracking("SUCCESS")],
  ] as [string, FundState][])("starts over from %s", (_name, state) => {
    expect(fundReducer(state, { type: "RESET" })).toEqual({ status: "idle" });
  });

  // Con dinero de camino, "empezar de nuevo" haría perder la dirección: no se permite.
  it("does not start over while a deposit may still be on its way", () => {
    const state = tracking("PROCESSING");
    expect(fundReducer(state, { type: "RESET" })).toBe(state);
  });
});
