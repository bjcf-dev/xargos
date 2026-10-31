import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentCheck } from "./agent-check";

export const metadata: Metadata = { title: "Agent check · xARGOS" };

/** Solo en desarrollo: comprueba en este navegador la clave del agente (F6, D30). */
export default function AgentCheckPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <AgentCheck />
    </main>
  );
}
