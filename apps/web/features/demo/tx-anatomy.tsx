import {
  ShieldCheckIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XCircleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatUnits, USDC_DECIMALS } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  describeShock,
  POOL_TOKEN,
  type StepTag,
  shockTrend,
  slippageLabel,
  stepTag,
} from "./copy";
import type { Run } from "./types";

const TAG_VARIANT: Record<StepTag, "default" | "secondary" | "outline"> = {
  guard: "default",
  action: "secondary",
  setup: "outline",
  cleanup: "outline",
};

type TxAnatomyProps = {
  run: Run;
  /** null en los estados de resultado: la cuenta atrás ya no importa. */
  secondsLeft: number | null;
  /** Instrucción que falló en un revert (D15), para marcarla. */
  failedIndex?: number | null;
};

/** Qué hace la tx paso a paso y qué garantiza el guard. Todas las cifras salen del build. */
export function TxAnatomy({ run, secondsLeft, failedIndex = null }: TxAnatomyProps) {
  const { quote, guard, steps } = run.build;
  const expected = formatUnits(quote.expectedOut, USDC_DECIMALS);
  const minimum = formatUnits(guard.minDelta, USDC_DECIMALS);
  const trend =
    run.shock?.priceBefore && run.shock.priceAfter
      ? shockTrend(run.shock.priceBefore, run.shock.priceAfter)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction anatomy</CardTitle>
        <CardDescription>
          One v0 transaction. The guard snapshots the agent&apos;s {POOL_TOKEN} account first and
          checks it last.
        </CardDescription>
        {secondsLeft !== null ? (
          <CardAction>
            <Badge variant={secondsLeft > 0 ? "outline" : "destructive"}>
              <TimerIcon data-icon="inline-start" />
              {secondsLeft > 0 ? `Valid for ${secondsLeft}s` : "Expired"}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Expected</span>
            <span className="text-2xl font-semibold tabular-nums">
              {expected} {POOL_TOKEN}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Guaranteed minimum</span>
            <span className="text-2xl font-semibold tabular-nums">
              {minimum} {POOL_TOKEN}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground">
          Max slippage {slippageLabel(quote.slippageBps)}. If the agent receives less than {minimum}{" "}
          {POOL_TOKEN}, the whole transaction reverts.
        </p>
        {run.shock?.priceBefore && run.shock.priceAfter ? (
          <Badge variant="destructive">
            {trend === "down" ? <TrendingDownIcon data-icon="inline-start" /> : null}
            {trend === "up" ? <TrendingUpIcon data-icon="inline-start" /> : null}
            {describeShock(run.shock.priceBefore, run.shock.priceAfter)}
          </Badge>
        ) : null}
        <Separator />
        <ol className="flex flex-col gap-1">
          {steps.map((step) => {
            const tag = stepTag(step, guard);
            const failed = step.index === failedIndex;
            return (
              <li
                key={step.index}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5",
                  tag === "guard" && "bg-muted",
                  failed && "ring-1 ring-destructive",
                )}
              >
                <span className="w-4 text-right font-mono text-muted-foreground tabular-nums">
                  {step.index}
                </span>
                <span className="flex-1">
                  {step.label} <span className="text-muted-foreground">· {step.protocol}</span>
                </span>
                {failed ? (
                  <Badge variant="destructive">
                    <XCircleIcon data-icon="inline-start" />
                    Failed
                  </Badge>
                ) : null}
                <Badge variant={TAG_VARIANT[tag]}>
                  {tag === "guard" ? <ShieldCheckIcon data-icon="inline-start" /> : null}
                  {tag}
                </Badge>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
