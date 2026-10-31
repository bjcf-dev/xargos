"use client";

import type { Recipe } from "@xargos/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatFee } from "@/features/demo/copy";
import { DEMO_RECIPE_ID } from "@/features/demo/use-recipe";
import { ApiClientError, api } from "@/lib/api";

type State =
  | { status: "loading" }
  | { status: "ready"; recipes: Recipe[] }
  | { status: "error"; message: string };

// Provisional hasta F4: comprueba de punta a punta lib/api + MSW en modo mock.
export function RecipeList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    api.listRecipes().then(
      (recipes) => active && setState({ status: "ready", recipes }),
      (error: unknown) =>
        active &&
        setState({
          status: "error",
          message: error instanceof ApiClientError ? error.message : "Unexpected error",
        }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <p className="mt-8 text-sm text-muted-foreground">Loading recipes…</p>;
  }
  if (state.status === "error") {
    return <p className="mt-8 text-sm text-destructive">{state.message}</p>;
  }
  return (
    <div className="mt-8 flex flex-col gap-4">
      {state.recipes.map((recipe) => (
        <section key={recipe.id} className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">
            {/* Solo la receta de la demo tiene pantalla: las demás se listan sin enlace. */}
            {recipe.id === DEMO_RECIPE_ID ? (
              <Link href="/demo" className="underline-offset-4 hover:underline">
                {recipe.name}
              </Link>
            ) : (
              recipe.name
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
          <p className="mt-2 text-sm">{formatFee(recipe.price)} per request, paid with x402.</p>
        </section>
      ))}
    </div>
  );
}
