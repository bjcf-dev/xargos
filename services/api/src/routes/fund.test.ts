import { ErrorResponse, FundAssetsResponse, FundQuote, FundStatusResponse } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import {
  type AuroraClient,
  AuroraError,
  type AuroraQuoteRequest,
  type AuroraQuoteResponse,
  type AuroraStatusResponse,
  type AuroraToken,
  createAuroraClient,
} from "../fund/aurora";
import { RateLimiter } from "../http/rate-limit";
import { CLIENT_IP_HEADER } from "./demo";
import { createFundRoutes, PROXY_SECRET_HEADER } from "./fund";

const SECRET = "s".repeat(32);
const NOW = Date.parse("2026-11-05T10:00:00.000Z");

const tokens: AuroraToken[] = [
  {
    assetId: "a:sol-usdc",
    decimals: 6,
    blockchain: "sol",
    symbol: "USDC",
    price: 1,
    priceUpdatedAt: "x",
  },
  {
    assetId: "a:base-usdc",
    decimals: 6,
    blockchain: "base",
    symbol: "USDC",
    price: 1,
    priceUpdatedAt: "x",
  },
  {
    assetId: "a:base-eth",
    decimals: 18,
    blockchain: "base",
    symbol: "ETH",
    price: 3000,
    priceUpdatedAt: "x",
  },
  {
    assetId: "a:arb-usdc",
    decimals: 6,
    blockchain: "arb",
    symbol: "USDC",
    price: 1,
    priceUpdatedAt: "x",
  },
  {
    assetId: "a:near-usdc",
    decimals: 6,
    blockchain: "near",
    symbol: "USDC",
    price: 1,
    priceUpdatedAt: "x",
  },
  {
    assetId: "a:base-doge",
    decimals: 8,
    blockchain: "base",
    symbol: "DOGE",
    price: 0.1,
    priceUpdatedAt: "x",
  },
];

const quoteAnswer = (extra: Partial<AuroraQuoteResponse["quote"]> = {}): AuroraQuoteResponse => ({
  timestamp: "2026-11-05T10:00:00.000Z",
  signature: "sig",
  correlationId: "corr-1",
  quoteRequest: {},
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
    withdrawFee: "248701",
    refundFee: "2400",
    ...extra,
  },
});

const statusAnswer: AuroraStatusResponse = {
  correlationId: "corr-1",
  status: "INCOMPLETE_DEPOSIT",
  updatedAt: "2026-11-05T10:05:00.000Z",
  quoteResponse: {
    quote: { deadline: "2026-11-05T10:30:00.000Z", timeWhenInactive: "2026-11-05T10:40:00.000Z" },
  },
  swapDetails: {
    originChainTxHashes: [
      { hash: "0x1", explorerUrl: "https://basescan.org/tx/0x1" },
      { hash: "0x2", explorerUrl: "javascript:alert(1)" },
    ],
    destinationChainTxHashes: [],
    amountIn: "2000000",
    amountInFormatted: "2.0",
    depositedAmount: "1500000",
    depositedAmountFormatted: "1.5",
    amountOut: null,
    refundReason: null,
  },
};

const validQuote = {
  originAsset: "a:base-usdc",
  amount: "2000000",
  recipient: "FundRecipientDemo111111111111111111111111111",
  refundTo: "0x00000000000000000000000000000000000f00d1",
  dry: false,
};

/** A fake client that records the quotes it receives. */
function fakeClient(overrides: Partial<AuroraClient> = {}) {
  const quotes: AuroraQuoteRequest[] = [];
  const client: AuroraClient = {
    tokens: async () => tokens,
    quote: async (request) => {
      quotes.push(request);
      return quoteAnswer({
        depositAddress: "0x00000000000000000000000000000000000de905",
        deadline: "2026-11-05T10:30:00.000Z",
        timeWhenInactive: "2026-11-05T10:40:00.000Z",
      });
    },
    status: async () => statusAnswer,
    depositSubmit: async () => {},
    ...overrides,
  };
  return { client, quotes };
}

function setup(
  client: AuroraClient | undefined,
  options: { quotesPerIp?: number; proxySecret?: string } = {},
) {
  const app = createFundRoutes({
    client,
    originChains: ["base", "arb", "eth"],
    maxUsd: 25,
    slippageBps: 100,
    proxySecret: options.proxySecret,
    quoteLimiter: new RateLimiter(options.quotesPerIp ?? 100, 60_000),
    statusLimiter: new RateLimiter(100, 60_000),
    now: () => NOW,
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { app, post };
}

const errorCode = async (res: Response) => ErrorResponse.parse(await res.json()).error.code;

describe("/fund without an Aurora key", () => {
  it.each([
    ["GET", "/fund/assets"],
    ["POST", "/fund/quote"],
    ["GET", "/fund/status/0xabc"],
    ["POST", "/fund/deposit"],
  ])("%s %s answers FUND_UNAVAILABLE with the contract body", async (method, path) => {
    const { app } = setup(undefined);
    const res = await app.request(path, { method });
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe("FUND_UNAVAILABLE");
  });
});

describe("GET /fund/assets", () => {
  it("gives USDC on Solana as destination and only the allowed origins", async () => {
    const { app } = setup(fakeClient().client);
    const body = FundAssetsResponse.parse(await (await app.request("/fund/assets")).json());
    expect(body.destination.assetId).toBe("a:sol-usdc");
    expect(body.origins.map((asset) => asset.assetId)).toEqual([
      "a:base-usdc",
      "a:base-eth",
      "a:arb-usdc",
    ]);
  });
});

describe("POST /fund/quote", () => {
  it("fixes the fields of the swap and returns the contract's quote", async () => {
    const { client, quotes } = fakeClient();
    const res = await setup(client).post("/fund/quote", validQuote);
    expect(res.status).toBe(200);
    const quote = FundQuote.parse(await res.json());
    expect(quote.depositAddress).toBe("0x00000000000000000000000000000000000de905");
    expect(quote.deadline).toBe("2026-11-05T10:30:00.000Z");
    // Aurora's fees reach the screen, which shows them before asking for the deposit.
    expect(quote).toMatchObject({ withdrawFee: "248701", refundFee: "2400" });
    expect(quotes[0]).toMatchObject({
      swapType: "EXACT_INPUT",
      depositType: "ORIGIN_CHAIN",
      refundType: "ORIGIN_CHAIN",
      recipientType: "DESTINATION_CHAIN",
      depositMode: "SIMPLE",
      destinationAsset: "a:sol-usdc",
      slippageTolerance: 100,
      deadline: "2026-11-05T10:30:00.000Z",
    });
  });

  it("never shows a deposit address for a dry quote", async () => {
    const { client } = fakeClient();
    const res = await setup(client).post("/fund/quote", { ...validQuote, dry: true });
    const quote = FundQuote.parse(await res.json());
    expect(quote.depositAddress).toBeUndefined();
  });

  it("answers FUND_UNAVAILABLE when a real quote comes back without an address", async () => {
    const { client } = fakeClient({ quote: async () => quoteAnswer() });
    const res = await setup(client).post("/fund/quote", validQuote);
    expect(await errorCode(res)).toBe("FUND_UNAVAILABLE");
  });

  it.each([
    ["under 1 USD", { amount: "500000" }],
    ["over the maximum", { amount: "30000000" }],
    ["worth too much in ETH", { originAsset: "a:base-eth", amount: "10000000000000000" }],
  ])("refuses an amount %s without calling Aurora", async (_name, change) => {
    const { client, quotes } = fakeClient();
    const res = await setup(client).post("/fund/quote", { ...validQuote, ...change });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    expect(quotes).toHaveLength(0);
  });

  it.each([
    ["an origin that is not offered", { originAsset: "a:near-usdc" }],
    ["a refund address that is not EVM", { refundTo: "nope" }],
  ])("refuses %s", async (_name, change) => {
    const { client, quotes } = fakeClient();
    const res = await setup(client).post("/fund/quote", { ...validQuote, ...change });
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    expect(quotes).toHaveLength(0);
  });

  it("turns Aurora's refusal into FUND_QUOTE_FAILED with its reason", async () => {
    const { client } = fakeClient({
      quote: async () => {
        throw new AuroraError("rejected", "Amount is too low", 400);
      },
    });
    const res = await setup(client).post("/fund/quote", validQuote);
    expect(res.status).toBe(400);
    const body = ErrorResponse.parse(await res.json());
    expect(body.error).toMatchObject({ code: "FUND_QUOTE_FAILED", message: "Amount is too low" });
  });

  it("turns Aurora being down into FUND_UNAVAILABLE", async () => {
    const { client } = fakeClient({
      quote: async () => {
        throw new AuroraError("unavailable", "Aurora timed out");
      },
    });
    const res = await setup(client).post("/fund/quote", validQuote);
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe("FUND_UNAVAILABLE");
  });
});

describe("GET /fund/status/:depositAddress", () => {
  it("maps Aurora's status, keeps the amounts and drops links that are not https", async () => {
    const { app } = setup(fakeClient().client);
    const res = await app.request("/fund/status/0xabc");
    const status = FundStatusResponse.parse(await res.json());
    expect(status).toMatchObject({
      depositAddress: "0xabc",
      status: "INCOMPLETE_DEPOSIT",
      amountIn: "2000000",
      depositedAmount: "1500000",
      deadline: "2026-11-05T10:30:00.000Z",
      timeWhenInactive: "2026-11-05T10:40:00.000Z",
    });
    expect(status.originTxs).toEqual([{ hash: "0x1", explorerUrl: "https://basescan.org/tx/0x1" }]);
    expect(status).not.toHaveProperty("amountOut");
  });

  it("passes the memo on and refuses one that is not a plain token", async () => {
    const asked: (string | undefined)[] = [];
    const { client } = fakeClient({
      status: async (_address, memo) => {
        asked.push(memo);
        return statusAnswer;
      },
    });
    const { app } = setup(client);
    expect((await app.request("/fund/status/0xabc?memo=42")).status).toBe(200);
    expect(asked).toEqual(["42"]);
    expect((await app.request("/fund/status/0xabc?memo=a%2Fb")).status).toBe(400);
  });
});

describe("POST /fund/deposit", () => {
  it("tells Aurora about the deposit", async () => {
    const sent: object[] = [];
    const { client } = fakeClient({
      depositSubmit: async (deposit) => {
        sent.push(deposit);
      },
    });
    const res = await setup(client).post("/fund/deposit", {
      depositAddress: "0xabc",
      txHash: "0x9",
    });
    expect(res.status).toBe(202);
    expect(sent).toEqual([{ txHash: "0x9", depositAddress: "0xabc" }]);
  });
});

describe("the limit per IP behind the Netlify proxy", () => {
  it("ignores a client IP sent without the proxy's secret", async () => {
    const { client } = fakeClient();
    const { post } = setup(client, { quotesPerIp: 1, proxySecret: SECRET });
    expect((await post("/fund/quote", validQuote, { [CLIENT_IP_HEADER]: "1.1.1.1" })).status).toBe(
      200,
    );
    // A different made-up IP does not buy a new quota: both count as the same connection.
    const second = await post("/fund/quote", validQuote, { [CLIENT_IP_HEADER]: "2.2.2.2" });
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("counts each client apart when the proxy proves the IP with its secret", async () => {
    const { client } = fakeClient();
    const { post } = setup(client, { quotesPerIp: 1, proxySecret: SECRET });
    const as = (ip: string) => ({ [CLIENT_IP_HEADER]: ip, [PROXY_SECRET_HEADER]: SECRET });
    expect((await post("/fund/quote", validQuote, as("1.1.1.1"))).status).toBe(200);
    expect((await post("/fund/quote", validQuote, as("2.2.2.2"))).status).toBe(200);
    expect((await post("/fund/quote", validQuote, as("1.1.1.1"))).status).toBe(429);
  });
});

describe("with the real client and a fake fetch", () => {
  it("never lets the API key reach a response or a log line", async () => {
    const key = "k".repeat(32);
    const logged: string[] = [];
    const client = createAuroraClient({
      apiUrl: "https://intents-api.aurora.dev",
      apiKey: key,
      fetch: (async () => {
        throw new TypeError(`fetch failed for https://intents-api.aurora.dev/api/tokens/${key}`);
      }) as typeof fetch,
      log: { error: (data, message) => logged.push(JSON.stringify([data, message])) },
    });
    const res = await setup(client).post("/fund/quote", validQuote);
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text + logged.join("")).not.toContain(key);
  });
});
