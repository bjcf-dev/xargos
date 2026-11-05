import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FundScreen } from "@/features/fund/fund-screen";
import { auroraEnabled } from "@/lib/features";

export const metadata: Metadata = { title: "Fund · xARGOS" };

/** Fondear desde otra cadena con Aurora Intents (mainnet, D31). Sin la bandera, no existe. */
export default function FundPage() {
  if (!auroraEnabled) notFound();
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <FundScreen />
    </main>
  );
}
