"use client";

import type { Recipe } from "@xargos/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFee } from "@/features/demo/copy";
import { DEMO_RECIPE_ID } from "@/features/demo/use-recipe";
import { ApiClientError, api } from "@/lib/api";

type State =
  | { status: "loading" }
  | { status: "ready"; recipes: Recipe[] }
  | { status: "error"; message: string };

const CARD = "flex flex-col gap-2 rounded-xl border border-border bg-card p-5";

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
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <p role="status" className="sr-only">
          Loading recipes…
        </p>
        <div aria-hidden className={CARD}>
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return <p className="text-sm text-destructive">{state.message}</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {state.recipes.map((recipe) => {
        const demo = recipe.id === DEMO_RECIPE_ID;
        return (
          <section
            key={recipe.id}
            className={`${CARD} transition-colors ${demo ? "hover:border-primary" : ""}`}
          >
            {demo ? (
              <Badge variant="outline" className="border-primary text-primary">
                Demo recipe
              </Badge>
            ) : null}
            <h2 className="text-lg font-semibold tracking-tight">
              {/* Solo la receta de la demo tiene pantalla: las demás se listan sin enlace. */}
              {demo ? (
                <Link href="/demo" className="underline-offset-4 hover:underline">
                  {recipe.name}
                </Link>
              ) : (
                recipe.name
              )}
            </h2>
            <p className="text-sm text-muted-foreground">{recipe.description}</p>
            <p className="mt-auto font-mono text-sm tabular-nums">
              {formatFee(recipe.price)} per request, paid with x402.
            </p>
          </section>
        );
      })}
    </div>
  );
}
