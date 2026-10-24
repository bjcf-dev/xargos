import { render, screen } from "@testing-library/react";
import { fixtureRecipe } from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createHandlers } from "@/mocks/handlers";
import Home from "./page";

const server = setupServer(...createHandlers());

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("renders the recipes served by the API, not a hardcoded fixture", async () => {
  // Nombre distinto al de la fixture: solo aparece si la página pasa por lib/api.
  const served = { ...fixtureRecipe, name: "Served by the API" };
  server.use(http.get("*/api/xargos/recipes", () => HttpResponse.json([served])));

  render(<Home />);

  expect(screen.getByRole("heading", { level: 1, name: "xARGOS" })).toBeDefined();
  expect(await screen.findByRole("heading", { level: 2, name: served.name })).toBeDefined();
});
