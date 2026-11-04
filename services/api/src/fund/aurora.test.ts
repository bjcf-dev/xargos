import { describe, expect, it } from "vitest";
import { AuroraError, type AuroraQuoteRequest, createAuroraClient } from "./aurora";

/** Built here, not written out, so the secret scanner does not take it for a real key. */
const KEY = "k".repeat(32);

const token = {
  assetId: "provisional:sol-usdc",
  decimals: 6,
  blockchain: "sol",
  symbol: "USDC",
  price: 1,
  priceUpdatedAt: "2026-11-04T10:00:00.000Z",
};

const quoteBody = {
  timestamp: "2026-11-04T10:00:00.000Z",
  signature: "sig",
  correlationId: "corr-1",
  quoteRequest: { dry: true },
  quote: {
    timeEstimate: 30,
    amountIn: "2000000",
    amountInFormatted: "2.0",
    amountInUsd: "2.00",
    minAmountIn: "2000000",
    amountOut: "1990000",
    amountOutFormatted: "1.99",
    amountOutUsd: "1.99",
    minAmountOut: "1970100",
  },
};

const statusBody = {
  correlationId: "corr-1",
  status: "PENDING_DEPOSIT",
  updatedAt: "2026-11-04T10:00:00.000Z",
  quoteResponse: { quote: { deadline: "2026-11-04T10:30:00.000Z" } },
  swapDetails: {
    intentHashes: [],
    nearTxHashes: [],
    originChainTxHashes: [],
    destinationChainTxHashes: [],
    amountIn: null,
    refundReason: null,
  },
};

const quoteRequest: AuroraQuoteRequest = {
  dry: true,
  swapType: "EXACT_INPUT",
  depositType: "ORIGIN_CHAIN",
  refundType: "ORIGIN_CHAIN",
  recipientType: "DESTINATION_CHAIN",
  depositMode: "SIMPLE",
  originAsset: "provisional:base-usdc",
  destinationAsset: "provisional:sol-usdc",
  amount: "2000000",
  slippageTolerance: 100,
  recipient: "FundRecipientDemo111111111111111111111111111",
  refundTo: "0x00000000000000000000000000000000000f00d1",
  deadline: "2026-11-04T10:30:00.000Z",
  quoteWaitingTimeMs: 3000,
};

type Answer = { status?: number; body?: unknown } | Error;

/** A fetch that answers in order and remembers what it was asked. */
function setup(answers: Answer[], options: { now?: () => number } = {}) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const logged: { data: object; message: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const answer = answers[requests.length - 1] ?? answers.at(-1);
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer?.body ?? {}), { status: answer?.status ?? 200 });
  }) as typeof globalThis.fetch;
  const client = createAuroraClient({
    apiUrl: "https://intents-api.aurora.dev/",
    apiKey: KEY,
    fetch,
    log: { error: (data, message) => logged.push({ data, message }) },
    ...options,
  });
  return { client, requests, logged };
}

async function failure(promise: Promise<unknown>): Promise<AuroraError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AuroraError);
  return error as AuroraError;
}

describe("createAuroraClient", () => {
  it("puts the key in the path and reads the token list as the live API sends it", async () => {
    // Step 0 (4 Nov): the list comes inside `tokens`, next to `asset_stats`.
    const s = setup([{ body: { asset_stats: [{ token_id: "x" }], tokens: [token] } }]);
    expect(await s.client.tokens()).toEqual([token]);
    expect(s.requests[0]?.url).toBe(`https://intents-api.aurora.dev/api/tokens/${KEY}`);
  });

  it("also reads a bare array, as the reference documents it", async () => {
    const s = setup([{ body: [token] }]);
    expect(await s.client.tokens()).toEqual([token]);
  });

  it("caches the token list for 5 minutes", async () => {
    let clock = 0;
    const s = setup([{ body: [token] }], { now: () => clock });
    await s.client.tokens();
    clock += 4 * 60 * 1000;
    await s.client.tokens();
    expect(s.requests).toHaveLength(1);
    clock += 2 * 60 * 1000;
    await s.client.tokens();
    expect(s.requests).toHaveLength(2);
  });

  it("posts the quote as JSON and reads the answer", async () => {
    const s = setup([{ body: quoteBody }]);
    const answer = await s.client.quote(quoteRequest);
    expect(answer.quote.minAmountOut).toBe("1970100");
    expect(s.requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(s.requests[0]?.init?.body))).toEqual(quoteRequest);
  });

  it("asks the status by deposit address, with the memo only when there is one", async () => {
    const s = setup([{ body: statusBody }]);
    expect((await s.client.status("0xabc")).status).toBe("PENDING_DEPOSIT");
    await s.client.status("0xabc", "m 1");
    expect(s.requests[0]?.url).toBe(
      `https://intents-api.aurora.dev/api/status/${KEY}?depositAddress=0xabc`,
    );
    expect(s.requests[1]?.url).toContain("depositMemo=m+1");
  });

  it("turns a 400 into a rejection with Aurora's reason", async () => {
    const s = setup([{ status: 400, body: { message: "Amount is too low", statusCode: 400 } }]);
    const error = await failure(s.client.quote(quoteRequest));
    expect(error.kind).toBe("rejected");
    expect(error.message).toBe("Amount is too low");
  });

  it.each([429, 500, 503, 401, 404])("treats an HTTP %i as unavailable", async (status) => {
    const s = setup([{ status, body: { message: "x", statusCode: status } }]);
    expect((await failure(s.client.tokens())).kind).toBe("unavailable");
  });

  it("treats a network failure and a timeout as unavailable", async () => {
    const down = setup([new TypeError("fetch failed")]);
    expect((await failure(down.client.tokens())).kind).toBe("unavailable");
    const slow = setup([new DOMException("The operation timed out.", "TimeoutError")]);
    const error = await failure(slow.client.tokens());
    expect(error.kind).toBe("unavailable");
    expect(error.message).toBe("Aurora timed out");
  });

  it("treats an answer it cannot read as unavailable", async () => {
    const s = setup([{ body: { status: "SOMETHING_NEW" } }]);
    expect((await failure(s.client.status("0xabc"))).kind).toBe("unavailable");
  });

  it("does not send a quote that skips the fields the backend fixes", async () => {
    const s = setup([{ body: quoteBody }]);
    const loose = { ...quoteRequest, swapType: "ANY_INPUT" } as unknown as AuroraQuoteRequest;
    await expect(s.client.quote(loose)).rejects.toThrow();
    expect(s.requests).toHaveLength(0);
  });

  it("never lets the key reach a log line or an error message", async () => {
    const s = setup([
      new TypeError(`fetch failed for https://intents-api.aurora.dev/api/tokens/${KEY}`),
      { status: 400, body: { message: `bad request /api/quote/${KEY}` } },
      { status: 500, body: { correlationId: "corr-9" } },
    ]);
    const errors = [
      await failure(s.client.tokens()),
      await failure(s.client.quote(quoteRequest)),
      await failure(s.client.status("0xabc")),
    ];
    const everything = JSON.stringify([s.logged, errors.map((error) => error.message)]);
    expect(everything).not.toContain(KEY);
    expect(s.logged.at(-1)?.data).toEqual({ call: "status", status: 500, correlationId: "corr-9" });
  });
});
