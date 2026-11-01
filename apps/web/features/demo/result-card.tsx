import type { Recipe } from "@xargos/shared";
import { AlertTriangleIcon, CheckCircle2Icon, ShieldCheckIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiMode } from "@/lib/api/mode";
import { formatUnits, USDC_DECIMALS } from "@/lib/format";
import { ellipsify, getExplorerUrl } from "@/lib/solana/explorer";
import {
  chargeLine,
  describeRevert,
  describeSpent,
  FAILED_PAYMENTS_HREF,
  formatFee,
  humanError,
  mockPaymentNote,
  POOL_TOKEN,
} from "./copy";
import type { DemoState } from "./types";

type ResultState = Extract<DemoState, { status: "confirmed" | "reverted" | "error" }>;

type ResultCardProps = {
  state: ResultState;
  mode: ApiMode;
  price: Recipe["price"];
};

function Signature({ signature, mode }: { signature: string; mode: ApiMode }) {
  if (mode === "mock") return <span>Signature: simulated</span>;
  return (
    <a
      className="font-mono underline underline-offset-4"
      href={getExplorerUrl(`tx/${signature}`)}
      target="_blank"
      rel="noreferrer"
    >
      {ellipsify(signature, 8)}
    </a>
  );
}

function FailedPaymentsLink() {
  return (
    <Link className="underline underline-offset-4" href={FAILED_PAYMENTS_HREF}>
      How failed payments work
    </Link>
  );
}

/** Resultado de la demo. D15: "guard" solo si falló el guard. D16: lo gastado, dicho claro. */
export function ResultCard({ state, mode, price }: ResultCardProps) {
  if (state.status === "confirmed") {
    const minimum = formatUnits(state.run.build.guard.minDelta, USDC_DECIMALS);
    return (
      <Alert role="presentation">
        <CheckCircle2Icon />
        <AlertTitle data-step-title tabIndex={-1}>
          Executed as promised
        </AlertTitle>
        <AlertDescription>
          <p>
            {mode === "mock"
              ? `Simulated confirmation. In devnet mode the guard only lets it land if the agent receives at least ${minimum} ${POOL_TOKEN}.`
              : `The guard checked that the agent received at least ${minimum} ${POOL_TOKEN}.`}
          </p>
          <p>
            <Signature signature={state.signature} mode={mode} />
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === "reverted") {
    const revert = describeRevert(state.run, state.failure);
    const spent = describeSpent(price, state.failure.networkFeeLamports ?? null);
    return (
      // Un revert del guard es la garantía funcionando: no va en rojo (el rojo queda en el paso).
      <Alert variant={revert.byGuard ? "default" : "destructive"} role="presentation">
        {revert.byGuard ? <ShieldCheckIcon /> : <XCircleIcon />}
        <AlertTitle data-step-title tabIndex={-1}>
          {revert.title}
        </AlertTitle>
        <AlertDescription>
          <p>{revert.detail}</p>
          {revert.figures ? (
            <dl className="my-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <dt>Would have received</dt>
              <dd className="font-mono tabular-nums">
                {revert.figures.received} {POOL_TOKEN}
              </dd>
              <dt>Guaranteed minimum</dt>
              <dd className="font-mono tabular-nums">
                {revert.figures.minimum} {POOL_TOKEN}
              </dd>
              <dt>Shortfall vs. minimum</dt>
              <dd className="font-mono tabular-nums">
                {revert.figures.shortfall} {POOL_TOKEN}
              </dd>
            </dl>
          ) : null}
          {mode === "mock" ? (
            <p>{mockPaymentNote(spent.recipeFee)}</p>
          ) : (
            <p>
              Spent: {spent.recipeFee} recipe fee (x402) ·{" "}
              {spent.networkFee ? `${spent.networkFee} network fee` : "network fee not available"}.
            </p>
          )}
          <p>Your position and funds are otherwise intact.</p>
          <p>
            <Signature signature={state.signature} mode={mode} />
          </p>
          <p>
            <FailedPaymentsLink />
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // Errores para personas: la frase arriba y el código del contrato en pequeño, para soporte.
  const human = humanError(state.error);
  const charge = chargeLine(state.failedAt, state.error, mode, formatFee(price));
  return (
    <Alert variant="destructive" role="presentation">
      <AlertTriangleIcon />
      <AlertTitle data-step-title tabIndex={-1}>
        {human.title}
      </AlertTitle>
      <AlertDescription>
        <p>{human.hint}</p>
        {charge ? (
          <p>
            {charge} <FailedPaymentsLink />
          </p>
        ) : null}
        <p className="font-mono text-xs text-muted-foreground">{state.error.code}</p>
      </AlertDescription>
    </Alert>
  );
}
