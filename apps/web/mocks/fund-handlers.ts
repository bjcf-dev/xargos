import {
  ERROR_HTTP,
  type ErrorCode,
  type FundAsset,
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
 * recorren los estados de /fund en modo mock sin backend. Fuera de 5–25 $ el backend lo rechaza
 * (VALIDATION_ERROR, como #101 con AURORA_MIN_USD=5) · 6 incompleto y reembolsado · 7 caduca sin
 * enviar · 8 reembolsado · 9 Aurora falla · 10 una consulta da 503 y luego bien · el resto, éxito.
 * El escenario va en la dirección (un carácter hex): una dirección sin escenario es NOT_FOUND.
 */
type Scenario = "5" | "6" | "7" | "8" | "9" | "a";
const SCENARIOS: Record<Scenario, (FundStatus | "short" | "503")[]> = {
  "5": ["short", "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "PROCESSING", "SUCCESS"],
  "6": ["short", "INCOMPLETE_DEPOSIT", "INCOMPLETE_DEPOSIT", "INCOMPLETE_DEPOSIT", "REFUNDED"],
  "7": ["short", "PENDING_DEPOSIT"],
  "8": ["short", "KNOWN_DEPOSIT_TX", "REFUNDED"],
  "9": ["short", "KNOWN_DEPOSIT_TX", "FAILED"],
  a: ["503", "short", "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "PROCESSING", "SUCCESS"],
};
const BY_UNITS: Record<string, Scenario> = { "6": "6", "7": "7", "8": "8", "9": "9", "10": "a" };

const scenarioFor = (units: bigint): Scenario => BY_UNITS[String(units)] ?? "5";
const isScenario = (c: string | undefined): c is Scenario => c !== undefined && c in SCENARIOS;

/** El rango de #101 en producción (AURORA_MIN_USD=5, máximo 25). */
const MIN_USD = 5;
const MAX_USD = 25;

const ORIGIN_TXS = fixtureFundSuccess.originTxs;
const DESTINATION_TXS = fixtureFundSuccess.destinationTxs;
/** Lo que se queda Aurora en la fixture del paso 0 (0,248701 USDC). */
const WITHDRAW_FEE_USD = 0.248701;

/** Handlers de /fund/* para el modo mock. El estado vive en esta closure. */
export function createFundHandlers({
  latencyMs = 0,
  sendWindowMs = 20_000,
  origins = fixtureFundAssets.origins,
}: {
  latencyMs?: number;
  sendWindowMs?: number;
  /** Para probar otros precios (p. ej. el USDC a 0,9994 $). */
  origins?: FundAsset[];
} = {}) {
  /** dirección → consultas hechas y la cotización (si la conoce: tras recargar, no). */
  const deposits = new Map<string, { polls: number; quote?: FundQuote }>();
  let created = 0;
  const wait = () => (latencyMs > 0 ? delay(latencyMs) : Promise.resolve());

  function price(body: FundQuoteRequest): FundQuote | { error: Response } {
    const asset = origins.find((o) => o.assetId === body.originAsset);
    if (!asset) return { error: apiError("FUND_QUOTE_FAILED", "This token is not supported") };
    const amountIn = BigInt(body.amount);
    const usd = Number(formatUnits(amountIn, asset.decimals)) * asset.priceUsd;
    // En céntimos, como el backend (#136): 5 USDC a 0,9994 $ son 5,00 $, no "menos de 5".
    const cents = Math.round(usd * 100) / 100;
    if (!(cents >= MIN_USD && cents <= MAX_USD)) {
      return {
        error: apiError(
          "VALIDATION_ERROR",
          `The amount must be worth between ${MIN_USD} and ${MAX_USD} USD`,
        ),
      };
    }
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
    const decimals = origins.find((o) => o.assetId === quote?.originAsset)?.decimals ?? 6;
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
        // Escenario 6: vuelve lo que llegó; el 8: vuelve todo.
        const back = address[2] === "6" ? partial : quote ? BigInt(quote.amountIn) : undefined;
        return {
          ...base,
          ...amounts,
          originTxs: ORIGIN_TXS,
          refundReason:
            address[2] === "6"
              ? (fixtureFundRefunded.refundReason ?? "Incomplete deposit")
              : "The swap could not be completed",
          // Como la fixture del paso 0: lo que llegó y lo que vuelve.
          ...(back !== undefined
            ? {
                depositedAmount: back.toString(),
                depositedAmountFormatted: formatUnits(back, decimals),
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

      const asset = origins.find((o) => o.assetId === body.originAsset);
      const units = BigInt(body.amount) / 10n ** BigInt(asset?.decimals ?? 6);
      const scenario = scenarioFor(units);
      created++;
      // El escenario va en la dirección: así se sigue igual tras recargar la página.
      const address = `0x${scenario}${created.toString(16).padStart(39, "0")}`;
      const deadline = Date.now() + (scenario === "7" ? sendWindowMs : 10 * MINUTE);
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
      const scenario = address[2];
      // Como #136: Aurora no conoce la dirección (un localStorage viejo o tocado a mano).
      if (!isScenario(scenario)) return apiError("NOT_FOUND", "Unknown deposit address");
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
