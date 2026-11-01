import type { Metadata } from "next";
import { DemoScreen } from "@/features/demo/demo-screen";

export const metadata: Metadata = { title: "Demo · xARGOS" };

export default function DemoPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <DemoScreen />
    </main>
  );
}
