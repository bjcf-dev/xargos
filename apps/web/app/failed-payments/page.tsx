import { ERROR_HTTP } from "@xargos/shared";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/eyebrow";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { FAILED_PAYMENT_CASES, type FailedPaymentCase } from "./cases";

export const metadata: Metadata = {
  title: "Failed payments · xARGOS",
  description: "What happens to an AI agent's x402 payment when a recipe cannot be delivered.",
};

const CHARGE_VARIANT = { none: "success", once: "warning", fees: "warning" } as const;

/**
 * El status y el código del contrato ("402 PAYMENT_REQUIRED"): el status sale de ERROR_HTTP.
 * El revert del guard no es un error HTTP: es la protección actuando en la cadena.
 */
function CodeLabel({ row }: { row: FailedPaymentCase }) {
  if (row.code === null) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge variant="protect">
          <ShieldCheckIcon data-icon="inline-start" />
          On-chain revert
        </Badge>
      </span>
    );
  }
  const { status } = ERROR_HTTP[row.code];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant={status >= 500 ? "destructive" : "warning"} className="font-mono">
        {status}
      </Badge>{" "}
      <code className="font-mono text-xs">{row.code}</code>
    </span>
  );
}

/** Lo que se cobra, en una pastilla con palabras y, si hace falta, el matiz al lado. */
function Charged({ charged }: { charged: FailedPaymentCase["charged"] }) {
  return (
    // En línea y no flex: el detalle sigue a la etiqueta y parte donde haga falta.
    <span className="leading-relaxed">
      <Badge variant={CHARGE_VARIANT[charged.level]} className="align-middle">
        {charged.label}
      </Badge>
      {charged.detail ? (
        <>
          <span className="text-muted-foreground"> · </span>
          <span>{charged.detail}</span>
        </>
      ) : null}
    </span>
  );
}

/** Cada pago fallido y qué se cobra (criterio del jurado; docs/api-contract.md). */
export default function FailedPaymentsPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 md:px-10">
      <div className="flex flex-col gap-3">
        <Eyebrow>x402 · failure handling</Eyebrow>
        <h1 className="text-4xl font-extrabold tracking-tight">Failed payments</h1>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          An agent pays for each recipe with x402 and gets one transaction to sign. When something
          goes wrong, this is what happens to its money.
        </p>
      </div>
      {/*
        En el móvil, una tarjeta por caso: tres columnas no caben en 390 px. La lista y la tabla
        salen las dos de FAILED_PAYMENT_CASES y se oculta una con CSS: se edita cases.ts, no esto.
      */}
      <ul className="flex flex-col gap-3 md:hidden">
        {FAILED_PAYMENT_CASES.map((row, i) => (
          <li
            key={row.case}
            aria-labelledby={`failed-case-${i}`}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm"
          >
            <h2 id={`failed-case-${i}`} className="font-semibold">
              {row.case}
            </h2>
            <CodeLabel row={row} />
            <p className="text-muted-foreground">{row.response}</p>
            <p>
              <span className="font-medium">Charged:</span> <Charged charged={row.charged} />
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-panel-raised/60">
            <tr className="border-b">
              <th scope="col" className="w-[24%] px-5 py-3 font-medium text-muted-foreground">
                Case
              </th>
              <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                What happens
              </th>
              <th scope="col" className="w-[26%] px-5 py-3 font-medium text-muted-foreground">
                Charged
              </th>
            </tr>
          </thead>
          <tbody>
            {FAILED_PAYMENT_CASES.map((row) => (
              <tr key={row.case} className="border-b align-top last:border-0">
                <th scope="row" className="px-5 py-4 font-medium">
                  {row.case}
                </th>
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-2">
                    <CodeLabel row={row} />
                    <span className="text-muted-foreground">{row.response}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <Charged charged={row.charged} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/demo" className={buttonVariants({ size: "lg", className: "self-start px-4" })}>
        Try it in the demo
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </main>
  );
}
