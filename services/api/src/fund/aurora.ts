import { z } from "zod";
import { redact } from "../http/log";

/**
 * Client of Aurora's Swap API (module fund, D31). Only HTTP: Aurora runs on mainnet, and the money
 * is moved by the user's own wallet. The API key goes in the path, so a URL is never logged:
 * failures log the call, the HTTP status and Aurora's correlationId.
 * Reference: docs.intents.aurora.dev, "Swap API" (get-supported-tokens, request-a-quote,
 * get-swap-status, submit-a-deposit).
 */

/** D25: a backend answer takes under 8 s, and the Netlify proxy cuts at 9 s. */
export const AURORA_TIMEOUT_MS = 7_000;
/** Token prices move slowly enough for a demo; this keeps /fund/assets off Aurora's rate limit. */
export const TOKENS_CACHE_MS = 5 * 60 * 1000;

// Aurora's shapes, as documented. Not strict: an extra field from Aurora must not break us.

export const AuroraToken = z.object({
  assetId: z.string().min(1),
  decimals: z.number().int().min(0),
  blockchain: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number(),
  priceUpdatedAt: z.string(),
  contractAddress: z.string().optional(),
});
export type AuroraToken = z.infer<typeof AuroraToken>;

export const AuroraQuoteRequest = z.object({
  dry: z.boolean(),
  swapType: z.literal("EXACT_INPUT"),
  depositType: z.literal("ORIGIN_CHAIN"),
  refundType: z.literal("ORIGIN_CHAIN"),
  recipientType: z.literal("DESTINATION_CHAIN"),
  depositMode: z.literal("SIMPLE"),
  originAsset: z.string().min(1),
  destinationAsset: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  slippageTolerance: z.number().int(),
  recipient: z.string().min(1),
  refundTo: z.string().min(1),
  deadline: z.string(),
  quoteWaitingTimeMs: z.number().int().max(3_000),
});
export type AuroraQuoteRequest = z.infer<typeof AuroraQuoteRequest>;

const AuroraQuote = z.object({
  timeEstimate: z.number(),
  amountIn: z.string(),
  amountInFormatted: z.string(),
  amountInUsd: z.string(),
  minAmountIn: z.string(),
  amountOut: z.string(),
  amountOutFormatted: z.string(),
  amountOutUsd: z.string(),
  minAmountOut: z.string(),
  deadline: z.string().optional(),
  timeWhenInactive: z.string().optional(),
  depositAddress: z.string().optional(),
  depositMemo: z.string().optional(),
});

export const AuroraQuoteResponse = z.object({
  timestamp: z.string(),
  signature: z.string(),
  correlationId: z.string().nullish(),
  quoteRequest: z.object({}).loose(),
  quote: AuroraQuote,
});
export type AuroraQuoteResponse = z.infer<typeof AuroraQuoteResponse>;

const AuroraTx = z.object({ hash: z.string(), explorerUrl: z.string() });

export const AuroraStatusResponse = z.object({
  correlationId: z.string(),
  status: z.enum([
    "KNOWN_DEPOSIT_TX",
    "PENDING_DEPOSIT",
    "INCOMPLETE_DEPOSIT",
    "PROCESSING",
    "SUCCESS",
    "REFUNDED",
    "FAILED",
  ]),
  updatedAt: z.string(),
  quoteResponse: z.object({ quote: AuroraQuote.partial() }).loose(),
  swapDetails: z.object({
    originChainTxHashes: z.array(AuroraTx),
    destinationChainTxHashes: z.array(AuroraTx),
    amountIn: z.string().nullish(),
    amountInFormatted: z.string().nullish(),
    amountOut: z.string().nullish(),
    amountOutFormatted: z.string().nullish(),
    depositedAmount: z.string().nullish(),
    depositedAmountFormatted: z.string().nullish(),
    refundedAmount: z.string().nullish(),
    refundedAmountFormatted: z.string().nullish(),
    refundReason: z.string().nullish(),
  }),
});
export type AuroraStatusResponse = z.infer<typeof AuroraStatusResponse>;

/**
 * Why a call failed, in the two ways the routes answer:
 * - `rejected`: Aurora said no to this request (400). Sending it again changes nothing.
 * - `unavailable`: Aurora failed, limited us, timed out or answered something we cannot read.
 */
export class AuroraError extends Error {
  constructor(
    readonly kind: "rejected" | "unavailable",
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "AuroraError";
  }
}

export type AuroraClient = {
  tokens(): Promise<AuroraToken[]>;
  quote(request: AuroraQuoteRequest): Promise<AuroraQuoteResponse>;
  status(depositAddress: string, depositMemo?: string): Promise<AuroraStatusResponse>;
  depositSubmit(deposit: { txHash: string; depositAddress: string; memo?: string }): Promise<void>;
};

type Logger = { error(data: object, message: string): void };

export function createAuroraClient({
  apiUrl,
  apiKey,
  fetch: doFetch = globalThis.fetch,
  timeoutMs = AURORA_TIMEOUT_MS,
  now = Date.now,
  log,
}: {
  apiUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  log?: Logger;
}): AuroraClient {
  const base = apiUrl.replace(/\/+$/, "");
  const url = (path: string, query?: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query ?? {})) if (value) params.set(name, value);
    const search = params.size > 0 ? `?${params}` : "";
    return `${base}/api/${path}/${encodeURIComponent(apiKey)}${search}`;
  };

  /** One call to Aurora. Every failure becomes an AuroraError, logged without the URL. */
  async function call<T>(name: string, input: string, init: RequestInit, schema: z.ZodType<T>) {
    let response: Response;
    try {
      response = await doFetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      log?.error({ call: name, timedOut }, "aurora unreachable");
      throw new AuroraError("unavailable", timedOut ? "Aurora timed out" : "Aurora unreachable");
    }
    const body: unknown = await response.json().catch(() => undefined);
    const correlationId = readCorrelationId(body);
    if (!response.ok) {
      log?.error({ call: name, status: response.status, correlationId }, "aurora error");
      // Only a 400 is about the request itself; 401/403/404 mean our key, 429 and 5xx their side.
      if (response.status === 400) {
        throw new AuroraError("rejected", auroraMessage(body), response.status);
      }
      throw new AuroraError("unavailable", "Aurora is not available", response.status);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      log?.error({ call: name, correlationId }, "aurora answered an unexpected shape");
      throw new AuroraError("unavailable", "Aurora answered an unexpected shape");
    }
    return parsed.data;
  }

  let cached: { at: number; tokens: AuroraToken[] } | undefined;

  return {
    async tokens() {
      if (cached && now() - cached.at < TOKENS_CACHE_MS) return cached.tokens;
      const tokens = await call("tokens", url("tokens"), { method: "GET" }, z.array(AuroraToken));
      cached = { at: now(), tokens };
      return tokens;
    },

    async quote(request) {
      return call(
        "quote",
        url("quote"),
        jsonPost(AuroraQuoteRequest.parse(request)),
        AuroraQuoteResponse,
      );
    },

    status(depositAddress, depositMemo) {
      return call(
        "status",
        url("status", { depositAddress, depositMemo }),
        { method: "GET" },
        AuroraStatusResponse,
      );
    },

    async depositSubmit({ txHash, depositAddress, memo }) {
      await call(
        "depositSubmit",
        url("deposit/submit"),
        jsonPost({ txHash, depositAddress, ...(memo ? { memo } : {}) }),
        z.unknown(),
      );
    },
  };
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function readCorrelationId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("correlationId" in body)) return undefined;
  const { correlationId } = body as { correlationId: unknown };
  return typeof correlationId === "string" ? correlationId : undefined;
}

/** Aurora's reason for a 400, without anything that could carry a key, and kept short. */
function auroraMessage(body: unknown): string {
  const message =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : "";
  return redact(message).slice(0, 200) || "Aurora rejected the quote";
}
