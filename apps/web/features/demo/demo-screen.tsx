"use client";

import type { DemoSetupStatus } from "@xargos/shared";
import { useEffect, useState } from "react";
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
import { canShock, DEMO_PATHS, type DemoPath, formatFee, secondsLeft } from "./copy";
import { ResultCard } from "./result-card";
import type { DemoSigner } from "./signer";
import { TxAnatomy } from "./tx-anatomy";
import { DEMO_AGENT, useDemo } from "./use-demo";
import { DEMO_RECIPE_ID, useRecipe } from "./use-recipe";
import { X402Timeline } from "./x402-timeline";

type DemoScreenProps = {
  api?: ApiClient;
  signer?: DemoSigner | null;
  pollIntervalMs?: number;
  mode?: ApiMode;
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
}: DemoScreenProps) {
  const load = useRecipe(api);
  const recipe = load.status === "ready" ? load.recipe : null;
  const [lastSetup, setLastSetup] = useState<DemoSetupStatus | null>(null);
  const [path, setPath] = useState<DemoPath | null>(null);
  const demo = useDemo({
    recipeId: recipe?.id ?? "",
    api,
    ...(signer !== undefined ? { signer } : {}),
    ...(pollIntervalMs ? { pollIntervalMs } : {}),
  });
  const { state } = demo;

  // La máquina suelta el estado del setup al pagar; la tarjeta del agente lo conserva.
  useEffect(() => {
    if (state.status === "setup") setLastSetup(state.setup);
    if (state.status === "idle") setLastSetup(null);
  }, [state]);

  const live =
    state.status === "built" || state.status === "shocking" || state.status === "signing";
  const now = useNow(live);
  const left = live ? secondsLeft(state.run.build.expiresAt, now) : null;
  const expired = left === 0;

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
        <AgentCard state={state} agent={DEMO_AGENT} setup={lastSetup} mode={mode} />

        <div className="flex min-w-0 flex-col gap-4">
          {state.status === "idle" ? (
            <Card>
              <CardHeader>
                <CardTitle>Run the recipe as an AI agent</CardTitle>
                <CardDescription>
                  A demo agent pays for this recipe with x402 and gets one transaction to sign. It
                  either delivers at least the guaranteed minimum or reverts entirely.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {(["A", "B"] as const).map((p) => (
                  <div key={p} className="flex flex-col items-start gap-1">
                    <Button
                      variant={p === "A" ? "default" : "outline"}
                      onClick={() => {
                        setPath(p);
                        demo.start();
                      }}
                    >
                      {DEMO_PATHS[p].label}
                    </Button>
                    <p className="text-sm text-muted-foreground">{DEMO_PATHS[p].line}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {state.status === "setup" ? (
            <Card>
              <CardHeader>
                <CardTitle>Preparing the agent</CardTitle>
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
              {/* En orden: primero se paga (x402), luego la tx y su firma. */}
              <X402Timeline state={state} mode={mode} price={recipe.price} />
              <TxAnatomy run={state.run} secondsLeft={left} />
              {state.status === "shocking" ? <Busy>Moving the pool price…</Busy> : null}
              {state.status === "signing" ? <Busy>Signing and sending…</Busy> : null}
              {state.status === "built" ? (
                <div className="flex flex-col gap-3">
                  {/* En el camino B, el shock va primero mientras se pueda lanzar; si no, firmar. */}
                  <fieldset aria-label="Next step" className="flex min-w-0 flex-wrap gap-2">
                    {path === "B" && !state.run.shock && canShock(left) ? (
                      <>
                        <Button onClick={demo.shock} disabled={!canShock(left)}>
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
                          <Button variant="outline" onClick={demo.shock} disabled={!canShock(left)}>
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
                    <p className="text-sm text-muted-foreground">
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
              <div className="flex gap-2">
                {demo.canRetry ? <Button onClick={demo.retry}>Try again</Button> : null}
                {startOver}
              </div>
            </>
          ) : null}

          {/* TODO(F11): nadie despacha EXPIRED ni REBUILD todavía; aquí irá "Rebuild for free". */}
          {state.status === "expired" || state.status === "rebuilding" ? (
            <>
              <Alert variant="destructive">
                <AlertTitle>The transaction expired before it was sent</AlertTitle>
                <AlertDescription>Start over to build a new one.</AlertDescription>
              </Alert>
              <div className="flex gap-2">{startOver}</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
