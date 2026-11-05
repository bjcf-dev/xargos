import { isAddress } from "@solana/kit";
import type { FundAsset, FundQuote, FundQuoteRequest } from "@xargos/shared";
import { formatUnits, parseUnits } from "@/lib/format";
import { FUND_COPY } from "./copy";

/** Lo que escribe el usuario en el paso 1, tal cual. */
export type FundForm = { originAsset: string; amount: string; recipient: string; refundTo: string };

export type FormReading =
  /** Falta algún campo: todavía no se cotiza ni se enseña ningún error. */
  | { kind: "incomplete" }
  | { kind: "invalid"; errors: Partial<Record<keyof FundForm, string>> }
  | { kind: "ready"; request: Omit<FundQuoteRequest, "dry"> };

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** El formulario → la petición de cotización, con el importe en unidades base del token. */
export function readFundForm(form: FundForm, origins: FundAsset[]): FormReading {
  const value = {
    originAsset: form.originAsset.trim(),
    amount: form.amount.trim(),
    recipient: form.recipient.trim(),
    refundTo: form.refundTo.trim(),
  };
  if (Object.values(value).some((v) => v === "")) return { kind: "incomplete" };

  const errors: Partial<Record<keyof FundForm, string>> = {};
  const asset = origins.find((o) => o.assetId === value.originAsset);
  if (!asset) errors.originAsset = FUND_COPY.form.originAsset;
  const amount = asset ? parseUnits(value.amount, asset.decimals) : undefined;
  if (asset && (amount === undefined || amount <= 0n)) errors.amount = FUND_COPY.form.amount;
  if (!isAddress(value.recipient)) errors.recipient = FUND_COPY.form.recipient;
  if (!EVM_ADDRESS.test(value.refundTo)) errors.refundTo = FUND_COPY.form.refundTo;

  if (Object.keys(errors).length > 0 || amount === undefined) return { kind: "invalid", errors };
  return { kind: "ready", request: { ...value, amount: amount.toString() } };
}

/** USDC en Base, el más barato para enviar; si no está, el primero que haya. */
export function defaultOrigin(origins: FundAsset[]): string | undefined {
  return (
    origins.find((o) => o.symbol === "USDC" && o.blockchain === "base")?.assetId ??
    origins[0]?.assetId
  );
}

/** Para pedir otra cotización con lo mismo de antes (desde `expired`). */
export function formFromQuote(quote: FundQuote): FundForm {
  return {
    originAsset: quote.originAsset,
    amount: quote.amountInFormatted,
    recipient: quote.recipient,
    refundTo: quote.refundTo,
  };
}

/** Lo que vale el importe, con el precio de Aurora ("≈ $2.00"). Solo orientativo. */
export function usdValue(amount: string, asset: FundAsset | undefined): string | undefined {
  if (!asset) return undefined;
  const base = parseUnits(amount, asset.decimals);
  if (base === undefined) return undefined;
  const usd = Number(formatUnits(base, asset.decimals)) * asset.priceUsd;
  return `≈ $${usd.toFixed(2)}`;
}
