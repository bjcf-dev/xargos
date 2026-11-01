import { cleanup, render, screen } from "@testing-library/react";
import { fixtureRecipe } from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createHandlers } from "@/mocks/handlers";
import Home from "./page";

const server = setupServer(...createHandlers());

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

it("renders the recipes served by the API, not a hardcoded fixture", async () => {
  // Nombre distinto al de la fixture: solo aparece si la página pasa por lib/api.
  const served = { ...fixtureRecipe, name: "Served by the API" };
  server.use(http.get("*/api/xargos/recipes", () => HttpResponse.json([served])));

  render(<Home />);

  expect(screen.getByRole("heading", { level: 1, name: "xARGOS" })).toBeDefined();
  expect(await screen.findByRole("heading", { level: 2, name: served.name })).toBeDefined();
});

it("links the demo recipe to /demo and shows every price", async () => {
  const other = { ...fixtureRecipe, id: "other", name: "Other recipe" };
  server.use(http.get("*/api/xargos/recipes", () => HttpResponse.json([fixtureRecipe, other])));

  render(<Home />);

  const link = await screen.findByRole("link", { name: fixtureRecipe.name });
  expect(link.getAttribute("href")).toBe("/demo");
  expect(screen.queryByRole("link", { name: "Other recipe" })).toBeNull();
  expect(screen.getAllByText("0.01 USDC per request, paid with x402.")).toHaveLength(2);
});
