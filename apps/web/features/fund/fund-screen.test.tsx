import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  FundAsset,
  FundAssetsResponse,
  FundQuote,
  FundStatus,
  FundStatusResponse,
} from "@xargos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { FundScreen } from "./fund-screen";
import type { DepositStore } from "./storage";
import type { Deposit } from "./types";
import type { FundScreenApi } from "./use-fund-assets";

afterEach(cleanup);

const USDC_SOL: FundAsset = {
  assetId: "nep141:sol-usdc",
  symbol: "USDC",
  blockchain: "sol",
  decimals: 6,
  priceUsd: 1,
};
const USDC_BASE: FundAsset = { ...USDC_SOL, assetId: "nep141:base-usdc", blockchain: "base" };
const ASSETS: FundAssetsResponse = { destination: USDC_SOL, origins: [USDC_BASE] };

const RECIPIENT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const REFUND_TO = "0x1111111111111111111111111111111111111111";
const ADDRESS = "0xdeposit000000000000000000000000000000ab";

const QUOTE: FundQuote = {
  dry: false,
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
  timeEstimateSeconds: 40,
  depositAddress: ADDRESS,
  deadline: "2099-01-01T00:00:00.000Z",
};
const DEPOSIT: Deposit = {
  depositAddress: ADDRESS,
  deadline: QUOTE.deadline as string,
  quote: QUOTE,
};
const QUOTE_LINE = "2 USDC from Base → ≈ 1.751299 USDC on Solana";

/** Una API falsa que el test mueve a mano: qué contesta Aurora y si falla. */
function fakeApi({ assetsFailFirst = false } = {}) {
  const control = {
    aurora: "PENDING_DEPOSIT" as FundStatus,
    extra: {} as Partial<FundStatusResponse>,
    failing: false,
    assetCalls: 0,
  };
  const api: FundScreenApi = {
    async assets() {
      control.assetCalls++;
      if (assetsFailFirst && control.assetCalls === 1) {
        throw new ApiClientError("FUND_UNAVAILABLE", "down", { status: 503 });
      }
      return ASSETS;
    },
    async quote(request) {
      if (request.dry) {
        const { depositAddress: _a, deadline: _d, ...dry } = QUOTE;
        return { ...dry, dry: true };
      }
      return QUOTE;
    },
    async status(address) {
      if (control.failing) throw new TypeError("fetch failed");
      return {
        depositAddress: address,
        status: control.aurora,
        originTxs: [],
        destinationTxs: [],
        ...control.extra,
      };
    },
  };
  return { api, control };
}

function memoryStore(initial?: Deposit): DepositStore {
  let saved = initial;
  return {
    load: () => saved,
    save: (d) => {
      saved = d;
    },
    clear: () => {
      saved = undefined;
    },
  };
}

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const slow = { timeout: 3_000 };

describe("FundScreen", () => {
  it("takes the user from the amount to the USDC that arrived", async () => {
    const { api, control } = fakeApi();
    render(<FundScreen api={api} store={memoryStore()} intervalMs={1} />);

    expect(screen.getByText("Real funds on mainnet")).toBeTruthy();
    await screen.findByLabelText(/amount/i);
    type(/amount/i, "2");
    type(/solana address/i, RECIPIENT);
    type(/0x/i, REFUND_TO);
    await waitFor(() => expect(screen.getByText(/you get/i)).toBeTruthy(), slow);

    fireEvent.click(screen.getByRole("button", { name: /get deposit address/i }));

    const send = await screen.findByRole("heading", { name: "Send exactly 2 USDC on Base" });
    expect(screen.getByText(QUOTE_LINE)).toBeTruthy();
    expect(screen.queryByLabelText(/amount/i)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(send));

    control.aurora = "KNOWN_DEPOSIT_TX";
    await screen.findByRole("heading", { name: "Deposit seen" });

    control.aurora = "SUCCESS";
    control.extra = { amountOutFormatted: "1.751299" };
    await screen.findByRole("heading", { name: "1.751299 USDC arrived" });
    expect(screen.getByText(QUOTE_LINE)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start over/i })).toBeTruthy();
  });

  it("picks an incomplete deposit up again after a reload", async () => {
    const { api, control } = fakeApi();
    control.aurora = "INCOMPLETE_DEPOSIT";
    control.extra = {
      amountIn: "2000000",
      depositedAmount: "1200000",
      depositedAmountFormatted: "1.2",
    };
    render(<FundScreen api={api} store={memoryStore(DEPOSIT)} intervalMs={1} />);

    await screen.findByRole("heading", { name: "Send 0.8 USDC more" });
    expect(screen.getByText(QUOTE_LINE)).toBeTruthy();
    expect(screen.getByText("1.2 USDC received")).toBeTruthy();
    expect(screen.queryByLabelText(/amount/i)).toBeNull();
  });

  it("offers a new address with the same details when time ran out", async () => {
    const { api } = fakeApi();
    const late = { ...DEPOSIT, deadline: "2020-01-01T00:00:00.000Z" };
    render(<FundScreen api={api} store={memoryStore(late)} intervalMs={1} />);

    await screen.findByRole("heading", { name: "Time ran out. Nothing was sent" });
    fireEvent.click(screen.getByRole("button", { name: /get a new address/i }));

    const amount = (await screen.findByLabelText(/amount/i)) as HTMLInputElement;
    expect(amount.value).toBe("2");
    expect((screen.getByLabelText(/solana address/i) as HTMLInputElement).value).toBe(RECIPIENT);
  });

  it("lets the user try again when the origins do not load", async () => {
    const { api } = fakeApi({ assetsFailFirst: true });
    render(<FundScreen api={api} store={memoryStore()} intervalMs={1} />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    await screen.findByLabelText(/amount/i);
  });

  it("keeps the deposit while a check fails, and says it is retrying", async () => {
    const { api, control } = fakeApi();
    control.failing = true;
    render(<FundScreen api={api} store={memoryStore(DEPOSIT)} intervalMs={1} />);

    await screen.findByText(/retrying/i);
    expect(screen.getByText(QUOTE_LINE)).toBeTruthy();

    control.failing = false;
    await waitFor(() => expect(screen.queryByText(/retrying/i)).toBeNull());
    expect(screen.getByRole("heading", { name: "Send exactly 2 USDC on Base" })).toBeTruthy();
  });
});
