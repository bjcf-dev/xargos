import type { Recipe } from "@xargos/shared";
import { AlertTriangleIcon, CheckCircle2Icon, ShieldAlertIcon, XCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiMode } from "@/lib/api/mode";
import { formatUnits, USDC_DECIMALS } from "@/lib/format";
import { ellipsify, getExplorerUrl } from "@/lib/solana/explorer";
import { describeRevert, describeSpent } from "./copy";
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

/** Resultado de la demo. D15: "guard" solo si falló el guard. D16: lo gastado, dicho claro. */
export function ResultCard({ state, mode, price }: ResultCardProps) {
  if (state.status === "confirmed") {
    const minimum = formatUnits(state.run.build.guard.minDelta, USDC_DECIMALS);
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Executed as promised</AlertTitle>
        <AlertDescription>
          <p>
            {mode === "mock"
              ? `Simulated confirmation. In devnet mode the guard only lets it land if the agent receives at least ${minimum} USDC.`
              : `The guard checked that the agent received at least ${minimum} USDC.`}
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
    const spent = describeSpent(price, null);
    return (
      <Alert variant="destructive">
        {revert.byGuard ? <ShieldAlertIcon /> : <XCircleIcon />}
        <AlertTitle>{revert.title}</AlertTitle>
        <AlertDescription>
          <p>{revert.detail}</p>
          <p>
            Spent: {spent.recipeFee} recipe fee (x402)
            {mode === "mock" ? ", simulated" : ""} ·{" "}
            {mode === "mock"
              ? "no network fee in mock mode"
              : (spent.networkFee ?? "network fee pending, read from the transaction")}
            .
          </p>
          <p>Your position and funds are otherwise intact.</p>
          <p>
            <Signature signature={state.signature} mode={mode} />
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>{state.error.message}</AlertTitle>
      <AlertDescription>
        <p className="font-mono">{state.error.code}</p>
      </AlertDescription>
    </Alert>
  );
}
