import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FundAsset, FundQuote, FundQuoteRequest } from "@xargos/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmountForm, FUND_PREVIEW_DELAY_MS } from "./amount-form";
import type { FundState } from "./types";

const USDC_SOL: FundAsset = {
  assetId: "nep141:sol-usdc",
  symbol: "USDC",
  blockchain: "sol",
  decimals: 6,
  priceUsd: 1,
};
const USDC_ARB: FundAsset = { ...USDC_SOL, assetId: "nep141:arb-usdc", blockchain: "arb" };
const USDC_BASE: FundAsset = { ...USDC_SOL, assetId: "nep141:base-usdc", blockchain: "base" };
const ORIGINS = [USDC_ARB, USDC_BASE];

const RECIPIENT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const REFUND_TO = "0x1111111111111111111111111111111111111111";

const REQUEST: FundQuoteRequest = {
  originAsset: USDC_BASE.assetId,
  amount: "2000000",
  recipient: RECIPIENT,
  refundTo: REFUND_TO,
  dry: true,
};

const PREVIEW: FundQuote = {
  dry: true,
  originAsset: USDC_BASE.assetId,
  destinationAsset: USDC_SOL.assetId,
  recipient: RECIPIENT,
  refundTo: REFUND_TO,
  amountIn: "2000000",
  amountInFormatted: "2",
  amountInUsd: "2.00",
  amountOut: "1751299",
  amountOutFormatted: "1.751299",
  amountOutUsd: "1.75",
  minAmountOut: "1733786",
  withdrawFee: "248701",
  refundFee: "10000",
  timeEstimateSeconds: 40,
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(state: FundState = { status: "idle" }) {
  const onPreview = vi.fn();
  const onRequest = vi.fn();
  const view = render(
    <AmountForm
      origins={ORIGINS}
      destination={USDC_SOL}
      state={state}
      onPreview={onPreview}
      onRequest={onRequest}
    />,
  );
  const rerender = (next: FundState) =>
    view.rerender(
      <AmountForm
        origins={ORIGINS}
        destination={USDC_SOL}
        state={next}
        onPreview={onPreview}
        onRequest={onRequest}
      />,
    );
  return { onPreview, onRequest, rerender };
}

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillValid(amount = "2") {
  type(/amount/i, amount);
  type(/solana address/i, RECIPIENT);
  type(/0x/i, REFUND_TO);
}

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("AmountForm", () => {
  it("starts on USDC on Base", () => {
    setup();
    expect((screen.getByLabelText(/you send/i) as HTMLSelectElement).value).toBe(USDC_BASE.assetId);
  });

  it("asks for a price once the form is complete, and only once", () => {
    const { onPreview } = setup();
    fillValid();
    expect(onPreview).not.toHaveBeenCalled();

    wait(FUND_PREVIEW_DELAY_MS);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith(REQUEST);

    wait(FUND_PREVIEW_DELAY_MS);
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("shows what arrives for the amount it was asked about", () => {
    const { rerender } = setup();
    fillValid();
    rerender({ status: "previewed", request: REQUEST, preview: PREVIEW });

    expect(screen.getByText(/you get/i).textContent).toContain("1.751299 USDC");
  });

  it("drops an old price as soon as the amount changes", () => {
    const { rerender } = setup();
    fillValid();
    rerender({ status: "previewed", request: REQUEST, preview: PREVIEW });

    type(/amount/i, "3");

    expect(screen.queryByText(/you get/i)).toBeNull();
  });

  it("flags a bad refund address and does not ask for a price", () => {
    const { onPreview } = setup();
    type(/amount/i, "2");
    type(/solana address/i, RECIPIENT);
    type(/0x/i, "0x123");
    wait(FUND_PREVIEW_DELAY_MS);

    expect(screen.getByText(/starts with 0x/i)).toBeTruthy();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("asks for the deposit address with a real request", () => {
    const { onRequest } = setup();
    fillValid();

    fireEvent.click(screen.getByRole("button", { name: /get deposit address/i }));

    expect(onRequest).toHaveBeenCalledWith({ ...REQUEST, dry: false });
  });

  it("cannot ask twice while the address is on its way", () => {
    const { rerender } = setup();
    fillValid();
    rerender({ status: "requesting", request: { ...REQUEST, dry: false } });

    const button = screen.getByRole("button", {
      name: /getting the address/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("explains why Aurora would not price it", () => {
    const { rerender } = setup();
    fillValid();
    rerender({
      status: "error",
      error: { code: "FUND_QUOTE_FAILED", message: "Amount too low" },
      request: { ...REQUEST, dry: false },
    });

    expect(screen.getByRole("alert").textContent).toContain("Amount too low");
  });

  it("folds the fees away, with Aurora's fee in USDC", () => {
    const { rerender } = setup();
    fillValid();
    rerender({ status: "previewed", request: REQUEST, preview: PREVIEW });

    const fees = screen.getByText("Fees").closest("details");
    expect(fees?.open).toBe(false);
    expect(fees?.textContent).toContain("0.248701 USDC");
    expect(fees?.textContent).toContain("If refunded: 0.01 USDC");
    expect(fees?.textContent).toContain("Usually about 40 s");
  });
});
