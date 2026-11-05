import {
  ERROR_HTTP,
  type ErrorCode,
  type FundQuote,
  type FundQuoteRequest,
  type FundStatus,
  type FundStatusResponse,
  fixtureFundAssets,
  fixtureFundQuoteDry,
  fixtureFundRefunded,
  fixtureFundSuccess,
} from "@xargos/shared";
import { delay, HttpResponse, http } from "msw";
import { formatUnits } from "@/lib/format";

const API = "*/api/xargos";
const MINUTE = 60_000;

const apiError = (code: ErrorCode, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status: ERROR_HTTP[code].status });

/**
 * Qué pasa con el depósito, según la parte entera del importe (en unidades del token). Así se
 * recorren los 8 estados de /fund en modo mock sin backend:
 * < 1 la cotización falla · 3 incompleto y reembolsado · 4 caduca sin enviar ·
 * 5 reembolsado · 6 Aurora falla · 7 una consulta da 503 y luego bien · el resto, éxito.
 */
type Scenario = "2" | "3" | "4" | "5" | "6" | "7";
const SCENARIOS: Record<Scenario, (FundStatus | "short" | "503")[]> = {
  "2": ["short", "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "PROCESSING", "SUCCESS"],
  "3": ["short", "INCOMPLETE_DEPOSIT", "INCOMPLETE_DEPOSIT", "INCOMPLETE_DEPOSIT", "REFUNDED"],
  "4": ["short", "PENDING_DEPOSIT"],
  "5": ["short", "KNOWN_DEPOSIT_TX", "REFUNDED"],
  "6": ["short", "KNOWN_DEPOSIT_TX", "FAILED"],
  "7": [
    "503",
    "short",
    "PENDING_DEPOSIT",
    "KNOWN_DEPOSIT_TX",
    "PROCESSING",
    "PROCESSING",
    "SUCCESS",
  ],
};

const scenarioFor = (units: bigint): Scenario => {
  const n = String(units);
  return n in SCENARIOS ? (n as Scenario) : "2";
};

const ORIGIN_TXS = fixtureFundSuccess.originTxs;
const DESTINATION_TXS = fixtureFundSuccess.destinationTxs;
/** Lo que se queda Aurora en la fixture del paso 0 (0,248701 USDC). */
const WITHDRAW_FEE_USD = 0.248701;

/** Handlers de /fund/* para el modo mock. El estado vive en esta closure. */
export function createFundHandlers({
  latencyMs = 0,
  sendWindowMs = 20_000,
}: {
  latencyMs?: number;
  sendWindowMs?: number;
} = {}) {
  /** dirección → consultas hechas y la cotización (si la conoce: tras recargar, no). */
  const deposits = new Map<string, { polls: number; quote?: FundQuote }>();
  let created = 0;
  const wait = () => (latencyMs > 0 ? delay(latencyMs) : Promise.resolve());

  function price(body: FundQuoteRequest): FundQuote | { error: Response } {
    const asset = fixtureFundAssets.origins.find((o) => o.assetId === body.originAsset);
    if (!asset) return { error: apiError("FUND_QUOTE_FAILED", "This token is not supported") };
    const amountIn = BigInt(body.amount);
    if (amountIn < 10n ** BigInt(asset.decimals)) {
      return { error: apiError("FUND_QUOTE_FAILED", "Amount too low") };
    }
    const usd = Number(formatUnits(amountIn, asset.decimals)) * asset.priceUsd;
    const out = Math.max(0, usd - WITHDRAW_FEE_USD);
    const amountOut = BigInt(Math.floor(out * 1e6));
    return {
      ...fixtureFundQuoteDry,
      dry: body.dry,
      originAsset: body.originAsset,
      recipient: body.recipient,
      refundTo: body.refundTo,
      amountIn: amountIn.toString(),
      amountInFormatted: formatUnits(amountIn, asset.decimals),
      amountInUsd: usd.toFixed(2),
      amountOut: amountOut.toString(),
      amountOutFormatted: formatUnits(amountOut, 6),
      amountOutUsd: out.toFixed(2),
      minAmountOut: ((amountOut * 99n) / 100n).toString(),
    };
  }

  function statusFor(address: string, step: FundStatus, quote?: FundQuote): FundStatusResponse {
    const amounts = quote
      ? { amountIn: quote.amountIn, amountInFormatted: quote.amountInFormatted }
      : {};
    const decimals =
      fixtureFundAssets.origins.find((o) => o.assetId === quote?.originAsset)?.decimals ?? 6;
    const partial = quote ? (BigInt(quote.amountIn) * 3n) / 4n : undefined;
    const base: FundStatusResponse = {
      depositAddress: address,
      status: step,
      updatedAt: new Date().toISOString(),
      originTxs: [],
      destinationTxs: [],
      ...(quote?.deadline ? { deadline: quote.deadline } : {}),
      ...(quote?.timeWhenInactive ? { timeWhenInactive: quote.timeWhenInactive } : {}),
    };
    switch (step) {
      case "PENDING_DEPOSIT":
        return base;
      case "KNOWN_DEPOSIT_TX":
      case "PROCESSING":
      case "FAILED":
        return { ...base, ...amounts, originTxs: ORIGIN_TXS };
      case "INCOMPLETE_DEPOSIT":
        return {
          ...base,
          ...amounts,
          originTxs: ORIGIN_TXS,
          ...(partial !== undefined
            ? {
                depositedAmount: partial.toString(),
                depositedAmountFormatted: formatUnits(partial, decimals),
              }
            : {}),
        };
      case "SUCCESS":
        return {
          ...base,
          ...amounts,
          originTxs: ORIGIN_TXS,
          destinationTxs: DESTINATION_TXS,
          ...(quote
            ? { amountOut: quote.amountOut, amountOutFormatted: quote.amountOutFormatted }
            : {}),
        };
      case "REFUNDED": {
        // Escenario 3: vuelve lo que llegó; el 5: vuelve todo.
        const back = address[2] === "3" ? partial : quote ? BigInt(quote.amountIn) : undefined;
        return {
          ...base,
          ...amounts,
          originTxs: ORIGIN_TXS,
          refundReason:
            address[2] === "3"
              ? (fixtureFundRefunded.refundReason ?? "Incomplete deposit")
              : "The swap could not be completed",
          ...(back !== undefined
            ? {
                refundedAmount: back.toString(),
                refundedAmountFormatted: formatUnits(back, decimals),
              }
            : {}),
        };
      }
    }
  }

  return [
    http.get(`${API}/fund/assets`, async () => {
      await wait();
      return HttpResponse.json(fixtureFundAssets);
    }),

    http.post<never, FundQuoteRequest>(`${API}/fund/quote`, async ({ request }) => {
      await wait();
      const body = await request.json();
      const quote = price(body);
      if ("error" in quote) return quote.error;
      if (body.dry) return HttpResponse.json(quote);

      const asset = fixtureFundAssets.origins.find((o) => o.assetId === body.originAsset);
      const units = BigInt(body.amount) / 10n ** BigInt(asset?.decimals ?? 6);
      const scenario = scenarioFor(units);
      created++;
      // El escenario va en la dirección: así se sigue igual tras recargar la página.
      const address = `0x${scenario}${created.toString(16).padStart(39, "0")}`;
      const deadline = Date.now() + (scenario === "4" ? sendWindowMs : 10 * MINUTE);
      const real: FundQuote = {
        ...quote,
        depositAddress: address,
        deadline: new Date(deadline).toISOString(),
        timeWhenInactive: new Date(deadline + 5 * MINUTE).toISOString(),
        correlationId: `mock-${created}`,
      };
      deposits.set(address, { polls: 0, quote: real });
      return HttpResponse.json(real);
    }),

    http.get<{ address: string }>(`${API}/fund/status/:address`, async ({ params }) => {
      await wait();
      const address = params.address;
      const scenario = (address[2] && address[2] in SCENARIOS ? address[2] : "2") as Scenario;
      const known = deposits.get(address) ?? { polls: 0 };
      deposits.set(address, known);
      const steps = SCENARIOS[scenario];
      const step = steps[Math.min(known.polls, steps.length - 1)] ?? "PENDING_DEPOSIT";
      known.polls++;

      if (step === "503") return apiError("FUND_UNAVAILABLE", "Aurora is not answering");
      if (step === "short") {
        // La forma corta de Aurora: solo el estado; el backend no añade nada más.
        return HttpResponse.json({
          depositAddress: address,
          status: "PENDING_DEPOSIT",
          originTxs: [],
          destinationTxs: [],
        });
      }
      return HttpResponse.json(statusFor(address, step, known.quote));
    }),
  ];
}
