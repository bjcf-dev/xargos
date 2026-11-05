"use client";

import type { FundAsset, FundQuote, FundQuoteRequest } from "@xargos/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatUnits } from "@/lib/format";
import { FUND_COPY, fundErrorText } from "./copy";
import { defaultOrigin, type FundForm, readFundForm, usdValue } from "./form";
import type { FundState } from "./types";
import { networkName } from "./view";

/** Cuánto se espera sin teclear antes de pedir el precio: no se cotiza en cada tecla. */
export const FUND_PREVIEW_DELAY_MS = 600;

type Fields = Omit<FundQuoteRequest, "dry">;

/** ¿La respuesta (precio o error) es de lo que hay escrito ahora? Si no, está vieja. */
const sameRequest = (a: Fields, b: Fields) =>
  a.originAsset === b.originAsset &&
  a.amount === b.amount &&
  a.recipient === b.recipient &&
  a.refundTo === b.refundTo;

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** Paso 1 (How much): origen, importe y las dos direcciones, con el precio en vivo debajo. */
export function AmountForm({
  origins,
  destination,
  state,
  initial,
  onPreview,
  onRequest,
}: {
  origins: FundAsset[];
  destination: FundAsset;
  state: FundState;
  initial?: FundForm;
  onPreview(request: FundQuoteRequest): void;
  onRequest(request: FundQuoteRequest): void;
}) {
  const id = useId();
  const [form, setForm] = useState<FundForm>(
    () =>
      initial ?? {
        originAsset: defaultOrigin(origins) ?? "",
        amount: "",
        recipient: "",
        refundTo: "",
      },
  );
  const set = (field: keyof FundForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const reading = readFundForm(form, origins);
  const ready = reading.kind === "ready" ? reading.request : undefined;
  const errors = reading.kind === "invalid" ? reading.errors : {};
  const asset = origins.find((o) => o.assetId === form.originAsset);

  // Precio en vivo: una sola vez por cada combinación de campos, cuando se deja de teclear.
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const askedFor = useRef<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readyKey = ready ? JSON.stringify(ready) : null;
  useEffect(() => {
    if (!readyKey || readyKey === askedFor.current) return;
    pending.current = setTimeout(() => {
      askedFor.current = readyKey;
      previewRef.current({ ...(JSON.parse(readyKey) as Fields), dry: true });
    }, FUND_PREVIEW_DELAY_MS);
    return () => clearTimeout(pending.current);
  }, [readyKey]);

  const current = (request: Fields) => ready !== undefined && sameRequest(request, ready);
  const preview: FundQuote | undefined =
    state.status === "previewed" && current(state.request) ? state.preview : undefined;
  const pricing = state.status === "previewing" && current(state.request);
  const error =
    state.status === "error" && current(state.request) ? fundErrorText(state.error) : undefined;
  const requesting = state.status === "requesting";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || requesting) return;
        // El precio pendiente ya no hace falta: saldría después y competiría con la dirección.
        clearTimeout(pending.current);
        askedFor.current = readyKey;
        onRequest({ ...ready, dry: false });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${id}-origin`}>
          You send
          <select
            id={`${id}-origin`}
            className={FIELD}
            value={form.originAsset}
            onChange={set("originAsset")}
          >
            {origins.map((o) => (
              <option key={o.assetId} value={o.assetId}>
                {o.symbol} · {networkName(o.blockchain)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor={`${id}-amount`}>Amount</label>
          <input
            id={`${id}-amount`}
            className={FIELD}
            inputMode="decimal"
            autoComplete="off"
            value={form.amount}
            onChange={set("amount")}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={`${id}-amount-note`}
          />
          <span id={`${id}-amount-note`} className="text-xs font-normal text-muted-foreground">
            {errors.amount ?? usdValue(form.amount, asset) ?? " "}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm font-medium">
        <label htmlFor={`${id}-recipient`}>Your Solana address</label>
        <input
          id={`${id}-recipient`}
          className={`${FIELD} font-mono`}
          autoComplete="off"
          spellCheck={false}
          value={form.recipient}
          onChange={set("recipient")}
          aria-invalid={errors.recipient ? true : undefined}
          aria-describedby={`${id}-recipient-note`}
        />
        <span id={`${id}-recipient-note`} className="text-xs font-normal text-muted-foreground">
          {errors.recipient ? (
            <span className="text-destructive">{errors.recipient}</span>
          ) : (
            <>
              {FUND_COPY.form.notTheAgent} {FUND_COPY.form.firstTimeCosts}
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 text-sm font-medium">
        <label htmlFor={`${id}-refund`}>Your 0x… address, for refunds</label>
        <input
          id={`${id}-refund`}
          className={`${FIELD} font-mono`}
          autoComplete="off"
          spellCheck={false}
          value={form.refundTo}
          onChange={set("refundTo")}
          aria-invalid={errors.refundTo ? true : undefined}
          aria-describedby={`${id}-refund-note`}
        />
        <span
          id={`${id}-refund-note`}
          className={`text-xs font-normal ${errors.refundTo ? "text-destructive" : "text-muted-foreground"}`}
        >
          {errors.refundTo ?? FUND_COPY.form.refundHint}
        </span>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {preview ? (
          <div className="flex flex-col gap-1">
            <p>
              You get <strong>≈ {preview.amountOutFormatted} USDC</strong> on Solana
            </p>
            <details className="text-muted-foreground">
              <summary className="cursor-pointer select-none">Fees</summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-4">
                {preview.withdrawFee && (
                  <li>
                    Aurora's fee: {formatUnits(preview.withdrawFee, destination.decimals)} USDC
                  </li>
                )}
                {preview.refundFee && asset && (
                  <li>
                    If refunded: {formatUnits(preview.refundFee, asset.decimals)} {asset.symbol}
                  </li>
                )}
                <li>Usually about {preview.timeEstimateSeconds} s</li>
              </ul>
            </details>
          </div>
        ) : pricing ? (
          <p className="text-muted-foreground">Getting a price…</p>
        ) : null}
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.hint}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" disabled={!ready || requesting} className="self-start">
        {requesting ? "Getting the address…" : "Get deposit address"}
      </Button>
    </form>
  );
}
