import { act, renderHook, waitFor } from "@testing-library/react";
import { fixtureRecipe } from "@xargos/shared";
import { delay, HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ApiClient, createApiClient } from "@/lib/api/client";
import { createHandlers } from "@/mocks/handlers";
import { DEMO_RECIPE_ID, useRecipe } from "./use-recipe";

const server = setupServer();
const api = createApiClient({ baseUrl: "http://localhost/api/xargos" });
const other = { ...fixtureRecipe, id: "other", name: "Other" };
const RECIPES = "*/api/xargos/recipes";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => server.resetHandlers(...createHandlers()));
afterAll(() => server.close());

const respondWith = (recipes: unknown[]) =>
  server.use(http.get(RECIPES, () => HttpResponse.json(recipes)));

describe("useRecipe", () => {
  it("DEMO_RECIPE_ID matches the shared fixture", () => {
    expect(DEMO_RECIPE_ID).toBe(fixtureRecipe.id);
  });

  it("picks the recipe by id, not the first one", async () => {
    respondWith([other, fixtureRecipe]);
    const { result } = renderHook(() => useRecipe(api));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({ status: "ready", recipe: fixtureRecipe });
  });

  it.each([
    ["an empty list", []],
    ["only other recipes", [other]],
  ])("reports missing with %s", async (_, recipes) => {
    respondWith(recipes);
    const { result } = renderHook(() => useRecipe(api));

    await waitFor(() => expect(result.current.status).toBe("missing"));
  });

  it("reports the API error message", async () => {
    server.use(
      http.get(RECIPES, () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Slow down" } },
          { status: 429 },
        ),
      ),
    );
    const { result } = renderHook(() => useRecipe(api));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({ status: "error", message: "Slow down" });
  });

  it("retry reloads after an error", async () => {
    server.use(
      http.get(
        RECIPES,
        () => HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 }),
        { once: true },
      ),
    );
    const { result } = renderHook(() => useRecipe(api));
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("a second retry aborts the first request", async () => {
    server.use(
      http.get(RECIPES, async () => {
        await delay(50);
        return HttpResponse.json([fixtureRecipe]);
      }),
    );
    const seen: string[] = [];
    const { result } = renderHook(() => {
      const load = useRecipe(api);
      seen.push(load.status);
      return load;
    });

    act(() => result.current.retry());
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(seen).not.toContain("error");
  });

  it("falls back to a generic message for non-Error failures", async () => {
    const failing = { listRecipes: () => Promise.reject("boom") } as unknown as ApiClient;
    const { result } = renderHook(() => useRecipe(failing));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({
      status: "error",
      message: "Could not load the recipe",
    });
  });
});
