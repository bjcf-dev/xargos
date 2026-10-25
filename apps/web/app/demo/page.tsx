import type { Metadata } from "next";
import { DemoScreen } from "@/features/demo/demo-screen";

export const metadata: Metadata = { title: "Demo · xARGOS" };

export default function DemoPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <DemoScreen />
    </main>
  );
}
