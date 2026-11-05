import type { FundQuote, FundQuoteRequest, FundStatus, FundStatusResponse } from "@xargos/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { type FundApi, runDeposit, runPreview, sendBy, trackDeposit } from "./runner";
import type { Deposit, FundEvent, FundState } from "./types";

const DEADLINE = Date.parse("2026-11-06T12:25:00.000Z");

const QUOTE: FundQuote = {
  dry: false,
  originAsset: "nep141:base-usdc",
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
  depositAddress: "0xdeposit",
  deadline: "2026-11-06T12:25:00.000Z",
  timeWhenInactive: "2026-11-06T12:30:00.000Z",
};

const DEPOSIT: Deposit = {
  depositAddress: "0xdeposit",
  deadline: "2026-11-06T12:25:00.000Z",
  timeWhenInactive: "2026-11-06T12:30:00.000Z",
  quote: QUOTE,
};

const REQUEST: FundQuoteRequest = {
  originAsset: QUOTE.originAsset,
  amount: "2000000",
  recipient: QUOTE.recipient,
  refundTo: QUOTE.refundTo,
  dry: true,
};

const answer = (s: FundStatus): FundStatusResponse => ({
  depositAddress: "0xdeposit",
  status: s,
  originTxs: [],
  destinationTxs: [],
});

/** Una api falsa que contesta, por orden, lo que se le dé: un estado o un error. */
function fakeApi(
  replies: (FundStatus | Error)[],
  quote: () => Promise<FundQuote> = async () => QUOTE,
) {
  const calls: { address: string; memo?: string }[] = [];
  const api: FundApi = {
    quote: vi.fn(quote),
    async status(address, memo) {
      calls.push({ address, ...(memo ? { memo } : {}) });
      const next = replies.shift();
      if (next === undefined) throw new Error("no more replies in the test");
      if (next instanceof Error) throw next;
      return answer(next);
    },
  };
  return { api, calls };
}

/** Reloj falso que avanza lo que duerme el runner. */
function fakeClock(start: number) {
  let t = start;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

const tracking = (deposit: Deposit = DEPOSIT): FundState => ({ status: "tracking", deposit });

describe("trackDeposit", () => {
  it("polls every interval until Aurora settles", async () => {
    const { api, calls } = fakeApi([
      "PENDING_DEPOSIT",
      "KNOWN_DEPOSIT_TX",
      "PROCESSING",
      "SUCCESS",
    ]);
    const clock = fakeClock(DEADLINE - 60_000);
    const events: FundEvent[] = [];

    const end = await trackDeposit(
      { api, now: clock.now, sleep: clock.sleep, intervalMs: 5_000 },
      (e) => events.push(e),
      tracking(),
      new AbortController().signal,
    );

    expect(end).toMatchObject({ status: "tracking", aurora: "SUCCESS" });
    expect(calls).toHaveLength(4);
    expect(clock.slept).toEqual([5_000, 5_000, 5_000]);
    expect(events.map((e) => e.type)).toEqual([
      "STATUS_RECEIVED",
      "STATUS_RECEIVED",
      "STATUS_RECEIVED",
      "STATUS_RECEIVED",
    ]);
  });

  it("keeps polling through failed checks", async () => {
    const down = new ApiClientError("FUND_UNAVAILABLE", "down", { status: 503 });
    const { api } = fakeApi([down, new TypeError("fetch failed"), "SUCCESS"]);
    const clock = fakeClock(DEADLINE - 60_000);
    const events: FundEvent[] = [];

    const end = await trackDeposit(
      { api, now: clock.now, sleep: clock.sleep },
      (e) => events.push(e),
      tracking(),
      new AbortController().signal,
    );

    expect(end).toMatchObject({ aurora: "SUCCESS" });
    expect(events.map((e) => e.type)).toEqual([
      "STATUS_FAILED",
      "STATUS_FAILED",
      "STATUS_RECEIVED",
    ]);
    expect(events[0]).toMatchObject({ error: { code: "FUND_UNAVAILABLE", message: "down" } });
    expect(events[1]).toMatchObject({ error: { code: "INTERNAL" } });
  });

  it("waits as long as a 429 asks before checking again, never less than the interval", async () => {
    const slowDown = (s: number) =>
      new ApiClientError("RATE_LIMITED", "slow down", { status: 429, retryAfterSeconds: s });
    const { api } = fakeApi([slowDown(30), slowDown(1), "SUCCESS"]);
    const clock = fakeClock(DEADLINE - 120_000);

    await trackDeposit(
      { api, now: clock.now, sleep: clock.sleep, intervalMs: 5_000 },
      () => {},
      tracking(),
      new AbortController().signal,
    );

    expect(clock.slept).toEqual([30_000, 5_000]);
  });

  it("makes one last check after the deadline and expires if nothing arrived", async () => {
    const { api, calls } = fakeApi(["PENDING_DEPOSIT", "PENDING_DEPOSIT"]);
    const clock = fakeClock(DEADLINE - 5_000);
    const events: FundEvent[] = [];

    const end = await trackDeposit(
      { api, now: clock.now, sleep: clock.sleep, intervalMs: 5_000 },
      (e) => events.push(e),
      tracking(),
      new AbortController().signal,
    );

    expect(end.status).toBe("expired");
    expect(calls).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual([
      "STATUS_RECEIVED",
      "DEADLINE_PASSED",
      "STATUS_RECEIVED",
    ]);
  });

  it("keeps following a deposit that shows up in the last check", async () => {
    const { api } = fakeApi(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"]);
    const clock = fakeClock(DEADLINE - 5_000);

    const end = await trackDeposit(
      { api, now: clock.now, sleep: clock.sleep, intervalMs: 5_000 },
      () => {},
      tracking(),
      new AbortController().signal,
    );

    expect(end).toMatchObject({ status: "tracking", aurora: "SUCCESS" });
  });

  it("asks for the memo too when the deposit has one", async () => {
    const { api, calls } = fakeApi(["SUCCESS"]);

    await trackDeposit(
      { api, now: () => DEADLINE - 60_000, sleep: async () => {} },
      () => {},
      tracking({ ...DEPOSIT, depositMemo: "m1" }),
      new AbortController().signal,
    );

    expect(calls).toEqual([{ address: "0xdeposit", memo: "m1" }]);
  });

  it("stops at once, without dispatching, when aborted", async () => {
    const controller = new AbortController();
    const { api } = fakeApi(["PENDING_DEPOSIT", "PENDING_DEPOSIT"]);
    const events: FundEvent[] = [];

    await trackDeposit(
      {
        api,
        now: () => DEADLINE - 60_000,
        sleep: async () => {
          controller.abort();
          throw controller.signal.reason;
        },
      },
      (e) => events.push(e),
      tracking(),
      controller.signal,
    );

    expect(events.map((e) => e.type)).toEqual(["STATUS_RECEIVED"]);
  });

  it("does nothing for a state that is not tracking", async () => {
    const { api, calls } = fakeApi([]);

    const end = await trackDeposit(
      { api },
      () => {},
      { status: "idle" },
      new AbortController().signal,
    );

    expect(end).toEqual({ status: "idle" });
    expect(calls).toHaveLength(0);
  });
});

describe("sendBy", () => {
  it("is the deadline", () => {
    expect(sendBy(DEPOSIT)).toBe(DEADLINE);
  });

  it("falls back to timeWhenInactive and says so in the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deadline: _, ...withoutDeadline } = DEPOSIT;

    expect(sendBy(withoutDeadline)).toBe(Date.parse("2026-11-06T12:30:00.000Z"));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("is undefined without either: the address never expires on its own", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deadline: _d, timeWhenInactive: _t, ...neither } = DEPOSIT;

    expect(sendBy(neither)).toBeUndefined();
    warn.mockRestore();
  });
});

describe("runPreview and runDeposit", () => {
  it("dispatches a dry quote", async () => {
    const { depositAddress: _, ...dry } = QUOTE;
    const { api } = fakeApi([], async () => ({ ...dry, dry: true }));
    const events: FundEvent[] = [];

    await runPreview({ api }, (e) => events.push(e), REQUEST, new AbortController().signal);

    expect(api.quote).toHaveBeenCalledWith({ ...REQUEST, dry: true }, expect.anything());
    expect(events.map((e) => e.type)).toEqual(["PREVIEW_REQUESTED", "PREVIEW_RECEIVED"]);
  });

  it("asks for a real quote and dispatches the deposit", async () => {
    const { api } = fakeApi([]);
    const events: FundEvent[] = [];

    await runDeposit({ api }, (e) => events.push(e), REQUEST, new AbortController().signal);

    expect(api.quote).toHaveBeenCalledWith({ ...REQUEST, dry: false }, expect.anything());
    expect(events.map((e) => e.type)).toEqual(["DEPOSIT_REQUESTED", "DEPOSIT_RECEIVED"]);
  });

  it("marks a failed price as dry, so it never undoes a deposit request", async () => {
    const { api } = fakeApi([], async () => {
      throw new ApiClientError("FUND_UNAVAILABLE", "down", { status: 503 });
    });
    const events: FundEvent[] = [];

    await runPreview({ api }, (e) => events.push(e), REQUEST, new AbortController().signal);

    expect(events.at(-1)).toMatchObject({ type: "QUOTE_FAILED", dry: true });
  });

  it("dispatches a failed quote with its code", async () => {
    const rejected = new ApiClientError("FUND_QUOTE_FAILED", "Amount too low", {
      status: 400,
      rejected: true,
    });
    const { api } = fakeApi([], async () => {
      throw rejected;
    });
    const events: FundEvent[] = [];

    await runDeposit({ api }, (e) => events.push(e), REQUEST, new AbortController().signal);

    expect(events.at(-1)).toEqual({
      type: "QUOTE_FAILED",
      error: { code: "FUND_QUOTE_FAILED", message: "Amount too low" },
    });
  });
});
