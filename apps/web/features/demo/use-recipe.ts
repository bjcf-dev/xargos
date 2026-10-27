import type { Recipe } from "@xargos/shared";
import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "@/lib/api/client";

/** La receta de la demo. Se elige por id: si el backend añade otra delante, no cambia. */
export const DEMO_RECIPE_ID = "exit-orca-lp-to-usdc";

export type RecipeLoad =
  | { status: "loading" }
  | { status: "ready"; recipe: Recipe }
  | { status: "missing" }
  | { status: "error"; message: string };

/** Carga la receta por id; `retry()` vuelve a pedirla y aborta la petición anterior. */
export function useRecipe(
  api: ApiClient,
  recipeId: string = DEMO_RECIPE_ID,
): RecipeLoad & { retry: () => void } {
  const [load, setLoad] = useState<RecipeLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` solo dispara la recarga.
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    api.listRecipes({ signal: controller.signal }).then(
      (recipes) => {
        if (controller.signal.aborted) return;
        const recipe = recipes.find((r) => r.id === recipeId);
        setLoad(recipe ? { status: "ready", recipe } : { status: "missing" });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Could not load the recipe";
        setLoad({ status: "error", message });
      },
    );
    return () => controller.abort();
  }, [api, recipeId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...load, retry };
}
