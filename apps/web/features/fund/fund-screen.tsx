"use client";

import { CheckIcon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AmountForm } from "./amount-form";
import { fundApi } from "./api";
import { FUND_COPY, fundErrorText } from "./copy";
import { type FundForm, formFromQuote } from "./form";
import { FundNowBlock } from "./fund-now";
import { sendBy } from "./runner";
import type { DepositStore } from "./storage";
import { useFund } from "./use-fund";
import { type FundScreenApi, useFundAssets } from "./use-fund-assets";
import { fundView } from "./view";

/**
 * /fund en una columna que crece hacia abajo: cada paso cerrado se queda arriba en una línea y
 * solo el paso abierto es grande. Los estados de Aurora nunca se ven: los traduce `fundView`.
 */
export function FundScreen({
  // Por defecto, la de lib/api: la página es de servidor y no puede pasar funciones (como DemoScreen).
  api = fundApi,
  store,
  intervalMs,
}: {
  api?: FundScreenApi;
  store?: DepositStore;
  intervalMs?: number;
}) {
  const assets = useFundAssets(api);
  const fund = useFund({
    api,
    ...(store ? { store } : {}),
    ...(intervalMs !== undefined ? { intervalMs } : {}),
  });
  const origins = assets.status === "ready" ? assets.assets.origins : undefined;
  const view = fundView(fund.state, origins);

  const deposit =
    fund.state.status === "tracking" || fund.state.status === "expired"
      ? fund.state.deposit
      : undefined;
  // sendBy avisa en consola si usa el respaldo: una vez por depósito, no en cada render.
  const deadline = useMemo(() => (deposit ? sendBy(deposit) : undefined), [deposit]);

  // El formulario se vuelve a montar al empezar de nuevo, vacío o con lo de antes.
  const [form, setForm] = useState<{ key: number; initial?: FundForm }>({ key: 0 });
  const startOver = (initial?: FundForm) => {
    fund.reset();
    setForm((f) => ({ key: f.key + 1, ...(initial ? { initial } : {}) }));
  };

  // Un solo canal por paso, como en la demo: el foco va al título nuevo y el lector lo dice.
  const panel = useRef<HTMLDivElement>(null);
  const nowKey = view.now.kind === "form" ? null : view.now.title;
  useEffect(() => {
    if (!nowKey) return;
    panel.current?.querySelector<HTMLElement>("[data-step-title]")?.focus();
  }, [nowKey]);

  const assetsError =
    assets.status === "error" ? (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{fundErrorText(assets.error).title}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {fundErrorText(assets.error).hint}
          <Button type="button" variant="outline" size="sm" onClick={assets.retry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Move USDC to Solana</h1>
        <p className="text-muted-foreground">
          Send from your own wallet on another chain. You get USDC on Solana.
        </p>
      </header>

      <Alert className="border-warning/50 bg-warning-soft">
        <TriangleAlertIcon className="text-warning!" />
        <AlertTitle className="text-warning">{FUND_COPY.mainnet.title}</AlertTitle>
        <AlertDescription>{FUND_COPY.mainnet.line}</AlertDescription>
      </Alert>

      {view.done.length > 0 && (
        <ol className="flex flex-col gap-2">
          {view.done.map((line) => (
            <li
              key={line.text}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm",
                line.faded && "opacity-60",
              )}
            >
              <span className="flex items-center gap-2">
                {!line.faded && <CheckIcon className="size-4 text-success" aria-hidden />}
                {line.text}
              </span>
              {line.link && (
                <a
                  href={line.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  {line.link.label}
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ol>
      )}

      <div ref={panel}>
        {view.now.kind !== "form" ? (
          <div className="flex flex-col gap-4">
            {/* Sin orígenes no se sabe la red ni el token: lo que dice dónde enviar. */}
            {assetsError}
            <FundNowBlock
              now={view.now}
              tone={view.tone}
              deadline={deadline}
              canStartOver={view.canStartOver}
              onStartOver={() => startOver()}
              onNewQuote={() => startOver(deposit ? formFromQuote(deposit.quote) : undefined)}
            />
          </div>
        ) : assets.status === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : assets.status === "error" ? (
          assetsError
        ) : (
          <AmountForm
            key={form.key}
            origins={assets.assets.origins}
            destination={assets.assets.destination}
            state={fund.state}
            {...(form.initial ? { initial: form.initial } : {})}
            onPreview={fund.preview}
            onRequest={fund.requestDeposit}
          />
        )}
      </div>

      {view.upcoming && <p className="text-sm text-muted-foreground opacity-70">{view.upcoming}</p>}
      {view.retrying && (
        <p role="status" className="text-sm text-muted-foreground">
          {FUND_COPY.now.retrying}
        </p>
      )}
    </div>
  );
}
