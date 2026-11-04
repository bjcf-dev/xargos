import { describe, expect, it } from "vitest";
import {
  FUND_FINAL_STATUSES,
  FundAssetsResponse,
  FundDepositRequest,
  FundQuote,
  FundQuoteRequest,
  FundStatus,
  FundStatusResponse,
  FundTx,
  routes,
} from "./contract";
import { ErrorResponse } from "./errors";
import * as fixtures from "./fixtures";

const request = {
  originAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  amount: "2000000",
  recipient: "FundRecipientDemo111111111111111111111111111",
  refundTo: "0x00000000000000000000000000000000000f00d1",
  dry: true,
};

describe("FundStatus", () => {
  it("has exactly Aurora's 7 states", () => {
    expect(FundStatus.options).toEqual([
      "PENDING_DEPOSIT",
      "KNOWN_DEPOSIT_TX",
      "INCOMPLETE_DEPOSIT",
      "PROCESSING",
      "SUCCESS",
      "REFUNDED",
      "FAILED",
    ]);
  });

  it("treats only SUCCESS, REFUNDED and FAILED as final", () => {
    expect([...FUND_FINAL_STATUSES].sort()).toEqual(["FAILED", "REFUNDED", "SUCCESS"]);
  });
});

describe("fund fixtures follow the contract", () => {
  it("FundAssetsResponse", () => {
    expect(() => FundAssetsResponse.parse(fixtures.fixtureFundAssets)).not.toThrow();
  });

  it.each([
    ["fixtureFundQuoteDry", fixtures.fixtureFundQuoteDry],
    ["fixtureFundQuote", fixtures.fixtureFundQuote],
  ])("%s is a valid FundQuote", (_name, fixture) => {
    expect(() => FundQuote.parse(fixture)).not.toThrow();
  });

  const byStatus = [
    ["PENDING_DEPOSIT", fixtures.fixtureFundPendingDeposit],
    ["KNOWN_DEPOSIT_TX", fixtures.fixtureFundKnownDepositTx],
    ["INCOMPLETE_DEPOSIT", fixtures.fixtureFundIncompleteDeposit],
    ["PROCESSING", fixtures.fixtureFundProcessing],
    ["SUCCESS", fixtures.fixtureFundSuccess],
    ["REFUNDED", fixtures.fixtureFundRefunded],
    ["FAILED", fixtures.fixtureFundFailed],
  ] as const;

  it.each(byStatus)("the %s fixture is a valid FundStatusResponse in that state", (status, f) => {
    expect(FundStatusResponse.parse(f).status).toBe(status);
  });

  it("has one fixture per Aurora state", () => {
    expect(byStatus.map(([status]) => status).sort()).toEqual([...FundStatus.options].sort());
  });

  it.each([
    ["fixtureErrorFundQuoteFailed", fixtures.fixtureErrorFundQuoteFailed, "FUND_QUOTE_FAILED"],
    ["fixtureErrorFundUnavailable", fixtures.fixtureErrorFundUnavailable, "FUND_UNAVAILABLE"],
  ])("%s is a valid ErrorResponse with code %s", (_name, fixture, code) => {
    expect(ErrorResponse.parse(fixture).error.code).toBe(code);
  });
});

describe("FundQuoteRequest", () => {
  it("accepts a valid request", () => {
    expect(() => FundQuoteRequest.parse(request)).not.toThrow();
  });

  it.each([
    ["a zero amount", { amount: "0" }],
    ["an amount with decimals", { amount: "2.5" }],
    [
      "a refund address that is not EVM",
      { refundTo: "FundRecipientDemo111111111111111111111111111" },
    ],
    ["a recipient that is not a Solana address", { recipient: request.refundTo }],
    ["an empty origin asset", { originAsset: "" }],
  ])("rejects %s", (_name, change) => {
    expect(FundQuoteRequest.safeParse({ ...request, ...change }).success).toBe(false);
  });
});

describe("FundQuote", () => {
  // Showing a deposit address for a dry quote would invite the user to send funds to nothing.
  it("rejects a dry quote that carries a deposit address", () => {
    const result = FundQuote.safeParse({
      ...fixtures.fixtureFundQuoteDry,
      depositAddress: "0x00000000000000000000000000000000000de905",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a real quote without a deposit address", () => {
    const { depositAddress: _, ...withoutAddress } = fixtures.fixtureFundQuote;
    expect(FundQuote.safeParse(withoutAddress).success).toBe(false);
  });

  it("keeps the deposited amount apart from the quoted one in INCOMPLETE_DEPOSIT", () => {
    const status = FundStatusResponse.parse(fixtures.fixtureFundIncompleteDeposit);
    expect(BigInt(status.depositedAmount ?? "0")).toBeLessThan(BigInt(status.amountIn ?? "0"));
  });

  it("carries Aurora's fees, already taken from amountOut (step 0)", () => {
    const quote = FundQuote.parse(fixtures.fixtureFundQuote);
    expect(quote.withdrawFee).toBe("248701");
    expect(BigInt(quote.amountOut)).toBeLessThan(BigInt(quote.amountIn));
  });

  it("accepts a real quote without timeWhenInactive or deadline", () => {
    const { timeWhenInactive: _a, deadline: _b, ...quote } = fixtures.fixtureFundQuote;
    expect(FundQuote.safeParse(quote).success).toBe(true);
  });
});

describe("FundTx", () => {
  it.each(["http://basescan.org/tx/0x1", "javascript:alert(1)", "not a url"])(
    "rejects the link %s: only https",
    (explorerUrl) => {
      expect(FundTx.safeParse({ hash: "0x1", explorerUrl }).success).toBe(false);
    },
  );

  it("accepts an https link", () => {
    expect(
      FundTx.safeParse({ hash: "0x1", explorerUrl: "https://basescan.org/tx/0x1" }).success,
    ).toBe(true);
  });
});

describe("FundDepositRequest", () => {
  it("needs the deposit address and the transaction hash", () => {
    expect(FundDepositRequest.safeParse({ depositAddress: "0xabc", txHash: "0x1" }).success).toBe(
      true,
    );
    expect(FundDepositRequest.safeParse({ depositAddress: "0xabc" }).success).toBe(false);
  });
});

describe("routes.fund", () => {
  it("encodes the deposit address and the optional memo", () => {
    expect(routes.fund.status("0xabc")).toBe("/fund/status/0xabc");
    expect(routes.fund.status("a/b", "m 1")).toBe("/fund/status/a%2Fb?memo=m%201");
  });
});
