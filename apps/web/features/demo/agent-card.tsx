import type { DemoSetupPhase, DemoSetupStatus } from "@xargos/shared";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { ApiMode } from "@/lib/api/mode";
import { formatUnits, SOL_DECIMALS, USDC_DECIMALS } from "@/lib/format";
import { ellipsify } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";
import type { DemoState } from "./types";

const PHASES: { phase: DemoSetupPhase; label: string }[] = [
  { phase: "queued", label: "Queued" },
  { phase: "funding_sol", label: "Funding SOL" },
  { phase: "funding_usdc", label: "Funding USDC" },
  { phase: "opening_position", label: "Opening the Orca position" },
  { phase: "ready", label: "Ready" },
];

/** Cuántas fases están hechas: todas una vez que la demo pasó del setup. */
function phasesDone(state: DemoState, setup: DemoSetupStatus | null): number {
  if (state.status === "idle") return 0;
  if (state.status === "setup") {
    const index = PHASES.findIndex((p) => p.phase === state.setup.phase);
    return state.setup.phase === "ready" ? PHASES.length : Math.max(0, index);
  }
  if (state.status === "error" && state.failedAt === "setup") {
    return Math.max(
      0,
      PHASES.findIndex((p) => p.phase === setup?.phase),
    );
  }
  return PHASES.length;
}

type AgentCardProps = {
  state: DemoState;
  agent: string;
  /** Último estado de setup conocido: la máquina lo suelta al pagar, la tarjeta lo conserva. */
  setup: DemoSetupStatus | null;
  mode: ApiMode;
};

export function AgentCard({ state, agent, setup, mode }: AgentCardProps) {
  const done = phasesDone(state, setup);
  const running = state.status === "setup" && done < PHASES.length;
  // En el móvil, con el setup terminado, las fases sobran: una línea y las acciones suben.
  const complete = done === PHASES.length && state.status !== "setup";

  return (
    // self-start: sin él la tarjeta se estira hasta el alto de la columna del panel.
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{mode === "mock" ? "Simulated agent" : "Agent"}</CardTitle>
        <CardDescription className="font-mono">{ellipsify(agent, 6)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {complete ? (
          <p className="flex items-center gap-2 text-sm md:hidden">
            <CheckCircle2Icon aria-hidden className="size-4 text-primary" />
            Agent ready
          </p>
        ) : null}
        <ol className={cn("flex flex-col gap-2 text-sm", complete && "hidden md:flex")}>
          {PHASES.map(({ phase, label }, index) => {
            const isDone = index < done;
            const isCurrent = running && index === done;
            return (
              <li
                key={phase}
                className={
                  isDone || isCurrent
                    ? "flex items-center gap-2"
                    : "flex items-center gap-2 text-muted-foreground"
                }
              >
                {isDone ? (
                  <CheckCircle2Icon aria-hidden className="size-4 text-primary" />
                ) : isCurrent ? (
                  <Spinner aria-hidden />
                ) : (
                  <CircleIcon aria-hidden className="size-4" />
                )}
                <span>{label}</span>
                <span className="sr-only">
                  {isDone ? "(done)" : isCurrent ? "(in progress)" : "(pending)"}
                </span>
              </li>
            );
          })}
        </ol>
        <Progress
          value={(done / PHASES.length) * 100}
          aria-label="Setup progress"
          className={cn(complete && "hidden md:flex")}
        />
        {/* balances.usdc es el USDC de Circle con el que el agente paga el x402, no el demo USDC del pool. */}
        {setup?.balances ? (
          <p className="font-mono text-sm">
            {formatUnits(setup.balances.sol, SOL_DECIMALS)} SOL ·{" "}
            {formatUnits(setup.balances.usdc, USDC_DECIMALS)} USDC
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
