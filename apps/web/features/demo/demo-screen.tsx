"use client";

import type { DemoSetupStatus } from "@xargos/shared";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api as defaultApi } from "@/lib/api";
import type { ApiClient } from "@/lib/api/client";
import { type ApiMode, apiMode } from "@/lib/api/mode";
import { AgentCard } from "./agent-card";
import {
  canShock,
  DEMO_PATHS,
  type DemoPath,
  formatFee,
  humanError,
  runAgainNote,
  secondsLeft,
  stepAnnouncement,
} from "./copy";
import { ResultCard } from "./result-card";
import type { DemoSigner } from "./signer";
import { TxAnatomy } from "./tx-anatomy";
import { type UseAgentOptions, useAgent } from "./use-agent";
import { useDemo } from "./use-demo";
import { DEMO_RECIPE_ID, useRecipe } from "./use-recipe";
import { X402Timeline } from "./x402-timeline";

type DemoScreenProps = {
  api?: ApiClient;
  signer?: DemoSigner | null;
  pollIntervalMs?: number;
  mode?: ApiMode;
  /** Para los tests: de dónde sale el agente fuera de mock (useAgent). */
  agentOptions?: UseAgentOptions;
};

/** Hora actual que se refresca cada segundo mientras `active`, para la cuenta atrás. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** role="status" (aria-live polite): el lector de pantalla anuncia el paso en curso. */
function Busy({ children }: { children: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner aria-hidden />
      {children}
    </p>
  );
}

/** Demo A y B en una pantalla: la tarjeta del agente a la izquierda y el paso actual a la derecha. */
export function DemoScreen({
  api = defaultApi,
  signer,
  pollIntervalMs,
  mode = apiMode,
  agentOptions,
}: DemoScreenProps) {
  const load = useRecipe(api);
  const agent = useAgent({ mode, ...agentOptions });
  const address = agent.status === "ready" ? agent.address : "";
  // Un signer pasado por props (tests) gana; si no, el del agente (undefined en mock: el de mock).
  const chosenSigner =
    signer !== undefined ? signer : agent.status === "ready" ? agent.signer : undefined;
  const recipe = load.status === "ready" ? load.recipe : null;
  // F8: el agente paga el build con su clave, como mucho el precio de la receta y en su mint.
  const payer = useMemo(() => {
    if (agent.status !== "ready" || !agent.payer || !recipe) return undefined;
    return agent.payer({ mint: recipe.price.mint, maxAmount: recipe.price.amount });
  }, [agent, recipe]);
  const [lastSetup, setLastSetup] = useState<DemoSetupStatus | null>(null);
  const [path, setPath] = useState<DemoPath | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const a11yId = useId();
  const firstStatus = useRef(true);
  const demo = useDemo({
    recipeId: recipe?.id ?? "",
    paymentMint: recipe?.price.mint,
    payer,
    agent: address,
    api,
    ...(chosenSigner !== undefined ? { signer: chosenSigner } : {}),
    ...(pollIntervalMs ? { pollIntervalMs } : {}),
  });
  const { state } = demo;

  // La máquina suelta el estado del setup al pagar; la tarjeta del agente lo conserva.
  useEffect(() => {
    if (state.status === "setup") setLastSetup(state.setup);
    if (state.status === "idle") setLastSetup(null);
  }, [state]);

  // Cada paso nuevo lleva el foco a su título (el último marcado: el resultado gana al x402 de
  // encima). En el primer render no, para no robar el foco al entrar en la página.
  // biome-ignore lint/correctness/useExhaustiveDependencies: el efecto se dispara por el cambio de paso.
  useEffect(() => {
    if (firstStatus.current) {
      firstStatus.current = false;
      return;
    }
    const titles = panelRef.current?.querySelectorAll<HTMLElement>("[data-step-title]");
    titles?.[titles.length - 1]?.focus();
  }, [state.status]);

  const live =
    state.status === "built" || state.status === "shocking" || state.status === "signing";
  const now = useNow(live || state.status === "expired");
  const left = live ? secondsLeft(state.run.build.expiresAt, now) : null;
  const expired = left === 0;
  const rebuildLeft =
    state.status === "expired" ? secondsLeft(state.run.build.rebuildUntil, now) : null;

  // expiresAt ya pasó: la tx caduca (D19). No basta con la cuenta a 0, que llega hasta 999 ms
  // antes (redondea hacia abajo) y el reducer la ignoraría. Firmando no: la tx puede estar en
  // vuelo y solo el signer sabe si entró (BUILD_EXPIRED la caduca desde el reducer).
  // Con el shock en vuelo tampoco: run.shock llega con SHOCK_SETTLED y, si caducara antes, otro
  // shock sería posible tras el rebuild (D10). Al volver a built, este efecto caduca la tx.
  const pastExpiry = state.status === "built" && now >= Date.parse(state.run.build.expiresAt);
  // Al cerrarse la ventana gratis, la tarjeta pasa a otro paso (el error con "Run again"): un
  // botón gratis con el foco nunca se convierte en uno de pago en el mismo sitio.
  const windowClosed =
    state.status === "expired" && now >= Date.parse(state.run.build.rebuildUntil);
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando cambia la caducidad.
  useEffect(() => {
    if (pastExpiry) demo.expire();
  }, [pastExpiry]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando se cierra la ventana.
  useEffect(() => {
    if (windowClosed) demo.rebuild();
  }, [windowClosed]);
  // El shock está bloqueado por falta de tiempo: su aviso lo describe para el lector de pantalla.
  const shockBlocked = live && !expired && !canShock(left);

  if (load.status === "error" || load.status === "missing") {
    return (
      <div className="flex flex-col items-start gap-3">
        {load.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>The recipe could not be loaded</AlertTitle>
            <AlertDescription>{load.message}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>The demo recipe is not available</AlertTitle>
            <AlertDescription>
              The backend does not list the demo recipe ({DEMO_RECIPE_ID}). Try again, or check that
              the backend is up to date.
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={load.retry}>Try again</Button>
      </div>
    );
  }
  if (!recipe) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (agent.status === "unsupported") {
    return (
      <Alert variant="destructive">
        <AlertTitle>This browser cannot create the agent's key</AlertTitle>
        <AlertDescription>
          The demo agent signs in your browser with Ed25519, which needs Chrome 137, Firefox 129,
          Safari 17 or later. Open the demo in one of them.
        </AlertDescription>
      </Alert>
    );
  }

  if (agent.status === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <AlertTitle>The agent's key could not be created</AlertTitle>
          <AlertDescription>
            This browser refused to create or read the demo agent's key ({agent.message}). Reload
            the page, or try another browser.
          </AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }

  const fee = formatFee(recipe.price);
  const startOver = (
    <Button
      variant="outline"
      onClick={() => {
        setPath(null);
        demo.reset();
      }}
    >
      Start over
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{recipe.description}</p>
        <p className="text-sm">{fee} per request, paid with x402.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <AgentCard
          state={state}
          agent={address}
          setup={lastSetup}
          mode={mode}
          persistent={agent.status !== "ready" || agent.persistent}
          {...(mode !== "mock" && agent.status === "ready"
            ? {
                onNewAgent: () => {
                  setPath(null);
                  demo.reset();
                  void agent.newAgent();
                },
              }
            : {})}
        />

        <div ref={panelRef} className="flex min-w-0 flex-col gap-4">
          <p data-testid="step-announcement" className="sr-only" aria-live="polite">
            {stepAnnouncement(state)}
          </p>
          {state.status === "idle" ? (
            <Card>
              <CardHeader>
                <CardTitle data-step-title tabIndex={-1}>
                  Run the recipe as an AI agent
                </CardTitle>
                <CardDescription>
                  A demo agent pays for this recipe with x402 and gets one transaction to sign. It
                  either delivers at least the guaranteed minimum or reverts entirely.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <fieldset aria-label="Choose a demo path" className="flex min-w-0 flex-col gap-4">
                  {(["A", "B"] as const).map((p) => (
                    <div key={p} className="flex flex-col items-start gap-1">
                      <Button
                        variant={p === "A" ? "default" : "outline"}
                        disabled={agent.status !== "ready"}
                        aria-label={DEMO_PATHS[p].ariaLabel}
                        aria-describedby={`${a11yId}-path-${p}`}
                        onClick={() => {
                          setPath(p);
                          demo.start();
                        }}
                      >
                        {DEMO_PATHS[p].label}
                      </Button>
                      <p id={`${a11yId}-path-${p}`} className="text-sm text-muted-foreground">
                        {DEMO_PATHS[p].line}
                      </p>
                    </div>
                  ))}
                </fieldset>
              </CardContent>
            </Card>
          ) : null}

          {state.status === "setup" ? (
            <Card>
              <CardHeader>
                <CardTitle data-step-title tabIndex={-1}>
                  Preparing the agent
                </CardTitle>
                <CardDescription>
                  {mode === "mock"
                    ? "Simulated setup: no devnet accounts are created."
                    : "Funding a fresh agent and opening its Orca position on devnet."}
                </CardDescription>
              </CardHeader>
              <CardFooter className="gap-2">
                <Button
                  onClick={demo.pay}
                  disabled={state.setup.phase !== "ready" || !state.setup.position}
                >
                  Pay & build
                </Button>
                {startOver}
              </CardFooter>
            </Card>
          ) : null}

          {state.status === "paying" ? (
            <>
              <X402Timeline state={state} mode={mode} price={recipe.price} />
              <Busy>Paying and building the transaction…</Busy>
            </>
          ) : null}

          {live ? (
            <>
              {/* Primero el pago (x402), justo debajo la siguiente acción (en el móvil queda a mano) y al final la tx. */}
              <X402Timeline state={state} mode={mode} price={recipe.price} />
              {state.status === "shocking" ? <Busy>Moving the pool price…</Busy> : null}
              {state.status === "signing" ? <Busy>Signing and sending…</Busy> : null}
              {state.status === "built" ? (
                <div className="flex flex-col gap-3">
                  {/* En el camino B, el shock va primero mientras se pueda lanzar; si no, firmar. */}
                  <fieldset aria-label="Next step" className="flex min-w-0 flex-wrap gap-2">
                    {path === "B" && !state.run.shock && canShock(left) ? (
                      <>
                        <Button
                          onClick={demo.shock}
                          aria-describedby={shockBlocked ? `${a11yId}-shock-hint` : undefined}
                          disabled={!canShock(left)}
                        >
                          Apply price shock first
                        </Button>
                        <Button variant="outline" onClick={demo.sign} disabled={expired}>
                          Sign & send
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={demo.sign} disabled={expired}>
                          Sign & send
                        </Button>
                        {!state.run.shock ? (
                          <Button
                            variant="outline"
                            onClick={demo.shock}
                            aria-describedby={shockBlocked ? `${a11yId}-shock-hint` : undefined}
                            disabled={!canShock(left)}
                          >
                            Apply price shock first
                          </Button>
                        ) : null}
                      </>
                    )}
                    {startOver}
                  </fieldset>
                  <p className="text-sm text-muted-foreground">
                    {mode === "mock"
                      ? "Mock mode simulates the signature. In devnet mode the agent's key signs it in your browser; xARGOS never sees it."
                      : "Signed in your browser by the agent's key. xARGOS never sees it."}
                  </p>
                  {!state.run.shock ? (
                    <p className="text-sm text-muted-foreground">
                      Demo B: the price shock moves the pool between the quote and the execution, as
                      an MEV bot or a fast market would.
                    </p>
                  ) : null}
                  {!state.run.shock && !expired && !canShock(left) ? (
                    <p id={`${a11yId}-shock-hint`} className="text-sm text-muted-foreground">
                      Not enough time left for the price shock. Sign now, or start over for a fresh
                      transaction.
                    </p>
                  ) : null}
                  {expired ? (
                    <p className="text-sm text-destructive">
                      The transaction expired before it was sent. Start over to build a new one.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <TxAnatomy run={state.run} secondsLeft={left} />
            </>
          ) : null}

          {state.status === "confirmed" || state.status === "reverted" ? (
            <>
              <X402Timeline state={state} mode={mode} price={recipe.price} />
              <ResultCard state={state} mode={mode} price={recipe.price} />
              <TxAnatomy
                run={state.run}
                secondsLeft={null}
                failedIndex={state.status === "reverted" ? state.failure.instructionIndex : null}
              />
              <div className="flex gap-2">{startOver}</div>
            </>
          ) : null}

          {state.status === "error" ? (
            <>
              <ResultCard state={state} mode={mode} price={recipe.price} />
              {demo.canRunAgain ? (
                <p className="text-sm text-muted-foreground">{runAgainNote(fee, mode)}</p>
              ) : null}
              <div className="flex gap-2">
                {demo.canRetry ? <Button onClick={demo.retry}>Try again</Button> : null}
                {demo.canRunAgain ? <Button onClick={demo.runAgain}>Run again</Button> : null}
                {startOver}
              </div>
            </>
          ) : null}

          {state.status === "expired" ? (
            <>
              <Alert variant="destructive" role="presentation">
                <AlertTitle data-step-title tabIndex={-1}>
                  The transaction expired before it was sent
                </AlertTitle>
                <AlertDescription>
                  {state.error ? (
                    <p>The free rebuild did not go through: {humanError(state.error).hint}</p>
                  ) : null}
                  <p>
                    Its blockhash is no longer valid, so nothing ran. Free rebuild for{" "}
                    {rebuildLeft ?? 0}s: same build, no new payment.
                  </p>
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button onClick={demo.rebuild}>Rebuild for free</Button>
                {startOver}
              </div>
            </>
          ) : null}

          {state.status === "rebuilding" ? (
            <>
              <X402Timeline state={state} mode={mode} price={recipe.price} />
              <Busy>Rebuilding the transaction for free…</Busy>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
