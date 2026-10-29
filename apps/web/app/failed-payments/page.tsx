import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FAILED_PAYMENT_CASES } from "./cases";

export const metadata: Metadata = {
  title: "Failed payments · xARGOS",
  description: "What happens to an AI agent's x402 payment when a recipe cannot be delivered.",
};

/** Cada pago fallido y qué se cobra (criterio del jurado; docs/api-contract.md). */
export default function FailedPaymentsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">Failed payments</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        An agent pays for each recipe with x402 and gets one transaction to sign. When something
        goes wrong, this is what happens to its money.
      </p>
      {/* En el móvil, una tarjeta por caso: tres columnas no caben en 390 px. */}
      <ul className="mt-6 flex flex-col gap-4 md:hidden">
        {FAILED_PAYMENT_CASES.map((row) => (
          <li key={row.case} className="rounded-lg border p-4 text-sm">
            <h2 className="font-medium">{row.case}</h2>
            <p className="mt-1 text-muted-foreground">{row.response}</p>
            <p className="mt-2">
              <span className="font-medium">Charged:</span> {row.charged}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-6 hidden md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-4 font-medium">
                Case
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                What happens
              </th>
              <th scope="col" className="py-2 font-medium">
                Charged
              </th>
            </tr>
          </thead>
          <tbody>
            {FAILED_PAYMENT_CASES.map((row) => (
              <tr key={row.case} className="border-b align-top last:border-0">
                <th scope="row" className="py-3 pr-4 font-medium">
                  {row.case}
                </th>
                <td className="py-3 pr-4 text-muted-foreground">{row.response}</td>
                <td className="py-3">{row.charged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/demo" className={buttonVariants({ className: "mt-6" })}>
        Try it in the demo
      </Link>
    </main>
  );
}
