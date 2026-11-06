import type { FundAsset, FundQuote, FundStatus, FundStatusResponse } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { formatClock } from "./countdown";
import type { Deposit, FundState } from "./types";
import { explorerLabel, fundView, missingAmount, networkName } from "./view";

const USDC_BASE: FundAsset = {
  assetId: "nep141:base-usdc",
  symbol: "USDC",
  blockchain: "base",
  decimals: 6,
  priceUsd: 1,
};
const ORIGINS = [USDC_BASE];

const QUOTE: FundQuote = {
  dry: false,
  originAsset: USDC_BASE.assetId,
  destinationAsset: "nep141:sol-usdc",
  recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  refundTo: "0x1111111111111111111111111111111111111111",
  amountIn: "2000000",
  amountInFormatted: "2",
  amountInUsd: "2.00",
  amountOut: "1751299",
  amountOutFormatted: "1.751299",
  amountOutUsd: "1.75",
  minAmountOut: "1733786",
  timeEstimateSeconds: 40,
  depositAddress: "0xdeposit000000000000000000000000000000ab",
  deadline: "2099-01-01T00:00:00.000Z",
};

const DEPOSIT: Deposit = {
  depositAddress: QUOTE.depositAddress as string,
  deadline: "2099-01-01T00:00:00.000Z",
  quote: QUOTE,
};

const ORIGIN_TX = { hash: "0xaaa", explorerUrl: "https://basescan.org/tx/0xaaa" };
const DEST_TX = { hash: "5sig", explorerUrl: "https://solscan.io/tx/5sig" };

const latest = (
  status: FundStatus,
  extra: Partial<FundStatusResponse> = {},
): FundStatusResponse => ({
  depositAddress: DEPOSIT.depositAddress,
  status,
  originTxs: [],
  destinationTxs: [],
  ...extra,
});

const tracking = (
  status: FundStatus | undefined,
  extra: Partial<FundStatusResponse> = {},
): FundState =>
  status === undefined
    ? { status: "tracking", deposit: DEPOSIT }
    : { status: "tracking", deposit: DEPOSIT, aurora: status, latest: latest(status, extra) };

const QUOTE_LINE = "2 USDC from Base → ≈ 1.751299 USDC on Solana";

describe("fundView", () => {
  it.each<FundState>([
    { status: "idle" },
    { status: "previewing", request: { ...QUOTE, amount: "2000000", dry: true } },
    {
      status: "error",
      error: { code: "FUND_QUOTE_FAILED", message: "Amount too low" },
      request: { ...QUOTE, amount: "2000000", dry: false },
    },
  ])("shows the form before there is a deposit ($status)", (state) => {
    expect(fundView(state, ORIGINS)).toMatchObject({
      done: [],
      now: { kind: "form" },
      tone: "progress",
      retrying: false,
      canStartOver: false,
    });
  });

  it("asks to send the exact amount while nothing has arrived", () => {
    for (const state of [tracking("PENDING_DEPOSIT")]) {
      const view = fundView(state, ORIGINS);
      expect(view.done).toEqual([{ text: QUOTE_LINE }]);
      expect(view.now).toEqual({
        kind: "send",
        title: "Send exactly 2 USDC on Base",
        address: DEPOSIT.depositAddress,
      });
      expect(view.tone).toBe("progress");
      expect(view.upcoming).toBe("Arrives at 9xQe...VFin");
      expect(view.canStartOver).toBe(false);
    }
  });

  // Desde timeWhenInactive Aurora deja de vigilar la dirección: el reembolso puede ser manual.
  it("says never to send after the address goes inactive, when Aurora gives that time", () => {
    const until = "2099-01-01T00:30:00.000Z";
    const deposit = { ...DEPOSIT, timeWhenInactive: until };
    for (const aurora of ["PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT"] as const) {
      const view = fundView(
        { status: "tracking", deposit, aurora, latest: latest(aurora) },
        ORIGINS,
      );
      expect(view.now).toMatchObject({
        neverAfter: `Never send after ${formatClock(until)}: Aurora stops watching this address, and getting a refund may need its support.`,
      });
    }
  });

  // Tras recargar no se sabe aún si ya llegó algo: nunca se pide enviar el importe entero a ciegas.
  it("checks a restored deposit before asking to send anything", () => {
    const view = fundView(tracking(undefined), ORIGINS);
    expect(view.now).toEqual({ kind: "checking", title: "Checking your deposit…" });
    expect(view.done).toEqual([{ text: QUOTE_LINE }]);
    expect(JSON.stringify(view)).not.toContain(DEPOSIT.depositAddress);
  });

  it("carries the memo when the deposit has one", () => {
    const state: FundState = {
      status: "tracking",
      deposit: { ...DEPOSIT, depositMemo: "m1" },
      aurora: "PENDING_DEPOSIT",
    };
    expect(fundView(state, ORIGINS).now).toMatchObject({ kind: "send", memo: "m1" });
  });

  it("shows the deposit as seen, with its transaction", () => {
    const view = fundView(tracking("KNOWN_DEPOSIT_TX", { originTxs: [ORIGIN_TX] }), ORIGINS);
    expect(view.done).toEqual([
      { text: QUOTE_LINE },
      {
        text: "Deposit seen on Base",
        link: { href: ORIGIN_TX.explorerUrl, label: "View on basescan.org" },
      },
    ]);
    expect(view.now).toEqual({
      kind: "arriving",
      title: "Deposit seen",
      stage: 1,
      estimate: "Usually about 40 s",
    });
  });

  it("shows the swap in progress", () => {
    expect(fundView(tracking("PROCESSING"), ORIGINS).now).toMatchObject({
      kind: "arriving",
      title: "Swapping to USDC…",
      stage: 2,
    });
  });

  it("asks for the rest of an incomplete deposit", () => {
    const view = fundView(
      tracking("INCOMPLETE_DEPOSIT", {
        amountIn: "2000000",
        depositedAmount: "1200000",
        depositedAmountFormatted: "1.2",
      }),
      ORIGINS,
    );
    expect(view.tone).toBe("action");
    expect(view.done[1]).toEqual({ text: "1.2 USDC received" });
    expect(view.now).toMatchObject({
      kind: "incomplete",
      title: "Send 0.8 USDC more",
      address: DEPOSIT.depositAddress,
    });
    if (view.now.kind !== "incomplete") return;
    expect(view.now.note).toContain("0x11...1111");
    expect(view.now.note).toMatch(/automatically/);
  });

  it("asks for the rest without a figure when it cannot work it out", () => {
    expect(fundView(tracking("INCOMPLETE_DEPOSIT"), ORIGINS).now).toMatchObject({
      title: "Send the rest",
    });
  });

  it("shows what arrived, with both transactions", () => {
    const view = fundView(
      tracking("SUCCESS", {
        amountOutFormatted: "1.751299",
        originTxs: [ORIGIN_TX],
        destinationTxs: [DEST_TX],
      }),
      ORIGINS,
    );
    expect(view.tone).toBe("success");
    expect(view.now).toEqual({
      kind: "success",
      title: "1.751299 USDC arrived",
      note: "at 9xQe...VFin",
      links: [
        { href: ORIGIN_TX.explorerUrl, label: "View on basescan.org" },
        { href: DEST_TX.explorerUrl, label: "View on solscan.io" },
      ],
    });
    expect(view.upcoming).toBeUndefined();
    expect(view.canStartOver).toBe(true);
  });

  it("shows a refund with its amount, destination and reason", () => {
    const view = fundView(
      tracking("REFUNDED", {
        refundedAmountFormatted: "1.2",
        refundReason: "Deposit was incomplete",
        originTxs: [ORIGIN_TX],
      }),
      ORIGINS,
    );
    expect(view.tone).toBe("info");
    expect(view.now).toMatchObject({
      kind: "refunded",
      title: "1.2 USDC returned to you",
      links: [{ href: ORIGIN_TX.explorerUrl, label: "View on basescan.org" }],
    });
    if (view.now.kind !== "refunded") return;
    expect(view.now.note).toBe("To 0x11...1111 on Base. Reason: Deposit was incomplete.");
    expect(view.canStartOver).toBe(true);
  });

  it("does not promise a refund when Aurora could not finish", () => {
    const view = fundView(tracking("FAILED"), ORIGINS);
    expect(view.tone).toBe("danger");
    expect(view.now).toMatchObject({
      kind: "failed",
      title: "Aurora couldn't complete the swap",
      address: DEPOSIT.depositAddress,
    });
    expect(JSON.stringify(view.now)).not.toMatch(/refund|returned|comes back/i);
    expect(view.now).toMatchObject({
      support: { href: "https://t.me/auroraisnear", label: "Ask Aurora's support on Telegram" },
    });
    expect(view.canStartOver).toBe(true);
  });

  it("explains an expired address without alarming", () => {
    const view = fundView({ status: "expired", deposit: DEPOSIT }, ORIGINS);
    expect(view.tone).toBe("action");
    expect(view.done).toEqual([
      { text: QUOTE_LINE },
      { text: "Deposit address 0xde...00ab expired", faded: true },
    ]);
    expect(view.now).toMatchObject({
      kind: "expired",
      title: "Time ran out. Nothing was sent",
      address: DEPOSIT.depositAddress,
      support: { href: "https://t.me/auroraisnear", label: "Ask Aurora's support on Telegram" },
    });
    if (view.now.kind !== "expired") return;
    expect(view.now.note).toContain("Don't send to this address anymore");
    expect(view.now.note).toContain("0x11...1111");
    expect(view.upcoming).toBeUndefined();
    expect(view.canStartOver).toBe(true);
  });

  // Aurora (5 nov): el reembolso es automático solo hasta timeWhenInactive; después, manual.
  it("promises an automatic refund only until the address goes inactive", () => {
    const until = "2099-01-01T00:30:00.000Z";
    const view = fundView(
      { status: "expired", deposit: { ...DEPOSIT, timeWhenInactive: until } },
      ORIGINS,
    );
    if (view.now.kind !== "expired") throw new Error("not expired");
    expect(view.now.note).toBe(
      `No funds moved. Don't send to this address anymore. If you already sent, it comes back to 0x11...1111 automatically until ${formatClock(until)}. After that, contact Aurora's support with this address.`,
    );
  });

  it("does not promise an automatic refund without the inactive time", () => {
    const view = fundView({ status: "expired", deposit: DEPOSIT }, ORIGINS);
    if (view.now.kind !== "expired") throw new Error("not expired");
    expect(view.now.note).not.toMatch(/comes back .* automatically\./);
    expect(view.now.note).toContain("contact Aurora's support with this address");
  });

  // #136: una dirección que Aurora no conoce. Se cierra, sin prometer nada, con el soporte a mano.
  it("closes an address Aurora does not know, with its support", () => {
    const view = fundView({ status: "unknown", deposit: DEPOSIT }, ORIGINS);
    expect(view.tone).toBe("danger");
    expect(view.done).toEqual([{ text: QUOTE_LINE }]);
    expect(view.now).toEqual({
      kind: "unknown",
      title: "This deposit address isn't known to Aurora",
      note: "Don't send to it. If you already did, contact Aurora's support with this address.",
      address: DEPOSIT.depositAddress,
      support: { href: "https://t.me/auroraisnear", label: "Ask Aurora's support on Telegram" },
    });
    expect(view.upcoming).toBeUndefined();
    expect(view.retrying).toBe(false);
    expect(view.canStartOver).toBe(true);
  });

  it("says it is retrying when the last check failed", () => {
    const state: FundState = {
      status: "tracking",
      deposit: DEPOSIT,
      lastError: { code: "FUND_UNAVAILABLE", message: "down" },
    };
    expect(fundView(state, ORIGINS).retrying).toBe(true);
  });

  const EVERY_STATE: FundState[] = [
    tracking(undefined),
    ...(
      [
        "PENDING_DEPOSIT",
        "KNOWN_DEPOSIT_TX",
        "INCOMPLETE_DEPOSIT",
        "PROCESSING",
        "SUCCESS",
        "REFUNDED",
        "FAILED",
      ] as const
    ).map((s) => tracking(s)),
    { status: "expired", deposit: DEPOSIT },
    { status: "unknown", deposit: DEPOSIT },
  ];

  it("never shows Aurora's own words", () => {
    for (const state of EVERY_STATE) {
      const { now, done, upcoming } = fundView(state, ORIGINS);
      const shown = JSON.stringify({ now: { ...now, address: undefined }, done, upcoming });
      expect(shown).not.toMatch(
        /PENDING_DEPOSIT|KNOWN_DEPOSIT_TX|INCOMPLETE_DEPOSIT|PROCESSING|deadline|memo|quote|intent/i,
      );
    }
  });

  it("never prints undefined when the origins have not loaded", () => {
    for (const state of EVERY_STATE) {
      expect(JSON.stringify(fundView(state, undefined))).not.toMatch(/undefined|null/);
    }
    expect(fundView(tracking("PENDING_DEPOSIT"), undefined).now).toMatchObject({
      title: "Send exactly 2",
    });
  });
});

describe("missingAmount", () => {
  it("is what was quoted minus what arrived", () => {
    expect(
      missingAmount(
        latest("INCOMPLETE_DEPOSIT", { amountIn: "2000000", depositedAmount: "1200000" }),
        6,
      ),
    ).toBe("0.8");
  });

  it("is unknown without both amounts, the decimals, or anything missing", () => {
    expect(missingAmount(latest("INCOMPLETE_DEPOSIT", { amountIn: "2000000" }), 6)).toBeUndefined();
    expect(
      missingAmount(
        latest("INCOMPLETE_DEPOSIT", { amountIn: "2000000", depositedAmount: "1200000" }),
        undefined,
      ),
    ).toBeUndefined();
    expect(
      missingAmount(
        latest("INCOMPLETE_DEPOSIT", { amountIn: "2000000", depositedAmount: "2000000" }),
        6,
      ),
    ).toBeUndefined();
    expect(missingAmount(undefined, 6)).toBeUndefined();
  });
});

describe("explorerLabel and networkName", () => {
  it("names the explorer by its domain", () => {
    expect(explorerLabel("https://www.basescan.org/tx/0xabc")).toBe("View on basescan.org");
    expect(explorerLabel("https://solscan.io/tx/5sig")).toBe("View on solscan.io");
  });

  it("names the chains Aurora uses", () => {
    expect(networkName("base")).toBe("Base");
    expect(networkName("arb")).toBe("Arbitrum");
    expect(networkName("eth")).toBe("Ethereum");
    expect(networkName("op")).toBe("Op");
  });
});
