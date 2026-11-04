import type { Recipe } from "@xargos/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiMode } from "@/lib/api/mode";
import { formatFee, mockPaymentNote, type X402StepState, x402Timeline } from "./copy";
import { StepIcon } from "./step-icon";
import type { DemoState } from "./types";

const STATE_TEXT: Record<X402StepState, string> = {
  done: "done",
  active: "in progress",
  pending: "pending",
  simulated: "simulated",
};

/** El intercambio x402, visible: es lo que viene a ver el jurado de "Best Use of x402". */
export function X402Timeline({
  state,
  mode,
  price,
}: {
  state: DemoState;
  mode: ApiMode;
  price: Recipe["price"];
}) {
  const fee = formatFee(price);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle data-step-title tabIndex={-1}>
          x402 payment
        </CardTitle>
        <CardDescription>
          {mode === "mock"
            ? mockPaymentNote(fee)
            : `The agent pays ${fee} per request, inside the HTTP call.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2 text-sm">
          {x402Timeline(state, mode).map((step) => (
            <li
              key={step.key}
              className={
                step.state === "done" || step.state === "active"
                  ? "flex items-center gap-2"
                  : "flex items-center gap-2 text-muted-foreground"
              }
            >
              <StepIcon state={step.state} />
              <span>{step.key === "challenge" ? `${step.label} · ${fee}` : step.label}</span>
              <span className="sr-only">({STATE_TEXT[step.state]})</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
