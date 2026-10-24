"use client";

import type { Recipe } from "@xargos/shared";
import { useEffect, useState } from "react";
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
          <h2 className="font-semibold">{recipe.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
        </section>
      ))}
    </div>
  );
}
