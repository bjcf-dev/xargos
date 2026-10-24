import { fixtureRecipe, Recipe } from "@xargos/shared";

// Provisional hasta F2: la receta llegará por lib/api (MSW en modo mock).
const recipe = Recipe.parse(fixtureRecipe);

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">xARGOS</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Multi-step DeFi recipes for AI agents, paid per request with x402 on Solana devnet. The
        transaction either delivers what was promised or does not execute at all.
      </p>
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">{recipe.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
      </section>
    </main>
  );
}
