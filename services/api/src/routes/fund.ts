import {
  type FundAsset,
  FundAssetsResponse,
  FundDepositRequest,
  FundQuote,
  FundQuoteRequest,
  FundStatusResponse,
} from "@xargos/shared";
import { type Context, Hono } from "hono";
import { type AuroraClient, AuroraError, type AuroraToken } from "../fund/aurora";
import { errorResponse } from "../http/errors";
import type { RateLimiter } from "../http/rate-limit";
import { clientKey, sameCode } from "./demo";

/** Header with which the Netlify proxy proves the client IP it forwards is its own (P0-1). */
export const PROXY_SECRET_HEADER = "x-xargos-proxy-secret";

/** Aurora says to keep the deposit window short; a quote older than this is not worth sending to. */
const QUOTE_DEADLINE_MS = 30 * 60 * 1000;
/** Aurora's own wait for solvers, under the 7 s of our client (D25). */
const QUOTE_WAITING_MS = 3_000;
/** What the agent ends up with: USDC on Solana. Looked up in Aurora's list, never hard-coded. */
const DESTINATION = { blockchain: "sol", symbol: "USDC" };
/** What a user may send from the origin chains. */
const ORIGIN_SYMBOLS = new Set(["USDC", "ETH"]);

export type FundRoutesDeps = {
  /** Without a client (no AURORA_API_KEY) every route answers FUND_UNAVAILABLE. */
  client: AuroraClient | undefined;
  originChains: readonly string[];
  /**
   * The smallest quote worth sending: Aurora's withdrawal fee is close to fixed (~0.25 USDC), so
   * below a few dollars it eats a large share. Configurable (AURORA_MIN_USD).
   */
  minUsd: number;
  maxUsd: number;
  slippageBps: number;
  /** Without it, the proxy's client IP is never trusted and every client shares its bucket. */
  proxySecret?: string | undefined;
  quoteLimiter: RateLimiter;
  statusLimiter: RateLimiter;
  /** One bucket for everybody, on top of the one per IP. */
  globalQuoteLimiter?: RateLimiter;
  now?: () => number;
};

/**
 * /fund/*: fund an agent from another chain with Aurora's Swap API (D31). xARGOS only quotes and
 * reads the status; the user's wallet sends the funds and nothing here signs or holds money.
 * No access code: judges test it with their own funds.
 */
export function createFundRoutes(deps: FundRoutesDeps) {
  const { client, originChains, minUsd, maxUsd, slippageBps, proxySecret, now = Date.now } = deps;
  const app = new Hono();

  /** The client's IP: the proxy's header only with the proxy's secret, else the connection's. */
  const keyOf = (c: Context) =>
    clientKey(
      c,
      proxySecret !== undefined && sameCode(c.req.header(PROXY_SECRET_HEADER), proxySecret),
    );

  const limited = (c: Context, limiter: RateLimiter, key: string) =>
    errorResponse(c, "RATE_LIMITED", "Too many requests, try later", {
      retryAfterSeconds: limiter.retryAfterSeconds(key),
    });

  const off = (c: Context) =>
    errorResponse(c, "FUND_UNAVAILABLE", "Funding from other chains is not available right now");

  /** An AuroraError becomes the contract's answer; anything else goes to onError (INTERNAL). */
  const failed = (c: Context, error: unknown) => {
    if (!(error instanceof AuroraError)) throw error;
    if (error.kind === "rejected") return errorResponse(c, "FUND_QUOTE_FAILED", error.message);
    return off(c);
  };

  async function assets(aurora: AuroraClient): Promise<FundAssetsResponse | undefined> {
    const tokens = await aurora.tokens();
    const destination = tokens.find(
      (token) => token.blockchain === DESTINATION.blockchain && token.symbol === DESTINATION.symbol,
    );
    const origins = tokens.filter(
      (token) => originChains.includes(token.blockchain) && ORIGIN_SYMBOLS.has(token.symbol),
    );
    const parsed = FundAssetsResponse.safeParse({
      destination: destination && toAsset(destination),
      origins: origins.map(toAsset),
    });
    return parsed.success ? parsed.data : undefined;
  }

  app.get("/fund/assets", async (c) => {
    if (!client) return off(c);
    const key = keyOf(c);
    if (!deps.statusLimiter.allow(key)) return limited(c, deps.statusLimiter, key);
    try {
      const list = await assets(client);
      return list ? c.json(list) : off(c);
    } catch (error) {
      return failed(c, error);
    }
  });

  app.post("/fund/quote", async (c) => {
    if (!client) return off(c);
    const key = keyOf(c);
    if (!deps.quoteLimiter.allow(key)) return limited(c, deps.quoteLimiter, key);
    const request = FundQuoteRequest.safeParse(await c.req.json().catch(() => null));
    if (!request.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid quote request");
    const { originAsset, amount, recipient, refundTo, dry } = request.data;

    try {
      const list = await assets(client);
      if (!list) return off(c);
      const origin = list.origins.find((asset) => asset.assetId === originAsset);
      if (!origin) return errorResponse(c, "VALIDATION_ERROR", "Unsupported origin asset");
      // Checked here so an amount out of range never reaches Aurora.
      // In cents, as a person reads it: 5 USDC priced at 0.9994 $ are 5.00 $, not "under 5".
      const usd =
        Math.round((Number(amount) / 10 ** origin.decimals) * origin.priceUsd * 100) / 100;
      if (!(usd >= minUsd && usd <= maxUsd)) {
        return errorResponse(
          c,
          "VALIDATION_ERROR",
          `The amount must be worth between ${minUsd} and ${maxUsd} USD`,
        );
      }
      if (deps.globalQuoteLimiter && !deps.globalQuoteLimiter.allow("all")) {
        return limited(c, deps.globalQuoteLimiter, "all");
      }

      const answer = await client.quote({
        dry,
        swapType: "EXACT_INPUT",
        depositType: "ORIGIN_CHAIN",
        refundType: "ORIGIN_CHAIN",
        recipientType: "DESTINATION_CHAIN",
        depositMode: "SIMPLE",
        originAsset,
        destinationAsset: list.destination.assetId,
        amount,
        slippageTolerance: slippageBps,
        recipient,
        refundTo,
        deadline: new Date(now() + QUOTE_DEADLINE_MS).toISOString(),
        quoteWaitingTimeMs: QUOTE_WAITING_MS,
      });
      const { quote } = answer;
      const parsed = FundQuote.safeParse({
        dry,
        originAsset,
        destinationAsset: list.destination.assetId,
        recipient,
        refundTo,
        amountIn: quote.amountIn,
        amountInFormatted: quote.amountInFormatted,
        amountInUsd: quote.amountInUsd,
        amountOut: quote.amountOut,
        amountOutFormatted: quote.amountOutFormatted,
        amountOutUsd: quote.amountOutUsd,
        minAmountOut: quote.minAmountOut,
        timeEstimateSeconds: quote.timeEstimate,
        // A dry quote must never show an address someone could send money to.
        ...(dry
          ? {}
          : present({ depositAddress: quote.depositAddress, depositMemo: quote.depositMemo })),
        ...present({
          withdrawFee: quote.withdrawFee,
          refundFee: quote.refundFee,
          deadline: quote.deadline,
          timeWhenInactive: quote.timeWhenInactive,
          correlationId: answer.correlationId ?? undefined,
        }),
      });
      return parsed.success ? c.json(parsed.data) : off(c);
    } catch (error) {
      return failed(c, error);
    }
  });

  app.get("/fund/status/:depositAddress", async (c) => {
    if (!client) return off(c);
    const key = keyOf(c);
    if (!deps.statusLimiter.allow(key)) return limited(c, deps.statusLimiter, key);
    const depositAddress = c.req.param("depositAddress");
    const memo = c.req.query("memo");
    if (!isAddressLike(depositAddress) || (memo !== undefined && !isAddressLike(memo))) {
      return errorResponse(c, "VALIDATION_ERROR", "Invalid deposit address");
    }

    try {
      const answer = await client.status(depositAddress, memo);
      // Aurora may answer only `{ status }` (shape 2 of its reference): no details, no deadlines.
      const full = "swapDetails" in answer ? answer : undefined;
      const details = full?.swapDetails;
      const quote = full?.quoteResponse.quote;
      const parsed = FundStatusResponse.safeParse({
        depositAddress,
        status: answer.status,
        originTxs: details?.originChainTxHashes.filter(isHttps) ?? [],
        destinationTxs: details?.destinationChainTxHashes.filter(isHttps) ?? [],
        ...present({
          updatedAt: full?.updatedAt,
          depositMemo: memo,
          amountIn: details?.amountIn,
          amountInFormatted: details?.amountInFormatted,
          depositedAmount: details?.depositedAmount,
          depositedAmountFormatted: details?.depositedAmountFormatted,
          amountOut: details?.amountOut,
          amountOutFormatted: details?.amountOutFormatted,
          refundedAmount: details?.refundedAmount,
          refundedAmountFormatted: details?.refundedAmountFormatted,
          refundReason: details?.refundReason,
          deadline: quote?.deadline,
          timeWhenInactive: quote?.timeWhenInactive,
        }),
      });
      return parsed.success ? c.json(parsed.data) : off(c);
    } catch (error) {
      // Aurora answers 400 for an address it does not know: that is "not found", not a refused quote.
      if (error instanceof AuroraError && error.kind === "rejected") {
        return errorResponse(c, "NOT_FOUND", "Unknown deposit address");
      }
      return failed(c, error);
    }
  });

  app.post("/fund/deposit", async (c) => {
    if (!client) return off(c);
    const key = keyOf(c);
    if (!deps.statusLimiter.allow(key)) return limited(c, deps.statusLimiter, key);
    const body = FundDepositRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return errorResponse(c, "VALIDATION_ERROR", "Invalid deposit");
    try {
      const { depositAddress, depositMemo, txHash } = body.data;
      await client.depositSubmit({
        txHash,
        depositAddress,
        ...(depositMemo ? { memo: depositMemo } : {}),
      });
      return c.json({ depositAddress }, 202);
    } catch (error) {
      return failed(c, error);
    }
  });

  return app;
}

function toAsset(token: AuroraToken): FundAsset {
  return {
    assetId: token.assetId,
    symbol: token.symbol,
    blockchain: token.blockchain,
    decimals: token.decimals,
    priceUsd: token.price,
  };
}

/** Drops null and undefined, so optional fields of the contract stay absent. */
function present<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

/** Deposit addresses and memos are plain tokens: no path, query or spaces reach Aurora. */
function isAddressLike(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

/** The front links explorerUrl: anything but https is dropped, not passed on. */
function isHttps(tx: { hash: string; explorerUrl: string }): boolean {
  return tx.explorerUrl.startsWith("https://");
}
