import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { RecipeList } from "./recipe-list";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">xARGOS</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Multi-step DeFi recipes for AI agents, paid per request with x402 on Solana devnet. The
        transaction either delivers what was promised or does not execute at all.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href="/demo" className={buttonVariants()}>
          Open the demo
        </Link>
        <Link href="/failed-payments" className="text-sm underline underline-offset-4">
          How failed payments work
        </Link>
      </div>
      <RecipeList />
    </main>
  );
}
