import { cleanup, render, screen } from "@testing-library/react";
import { fixtureRecipe } from "@xargos/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createHandlers } from "@/mocks/handlers";
import Home, { CLOSING_TITLE } from "./page";

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

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Delivered as promised, or not executed at all.",
    }),
  ).toBeDefined();
  expect(await screen.findByRole("heading", { level: 2, name: served.name })).toBeDefined();
});

it("announces the loading recipes to screen readers", async () => {
  render(<Home />);

  expect(screen.getByRole("status").textContent).toBe("Loading recipes…");
  await screen.findByRole("heading", { level: 2, name: fixtureRecipe.name });
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

it("tells what xARGOS is in the headline and points to the demo", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Delivered as promised, or not executed at all.",
    }),
  ).toBeDefined();
  const demoLinks = screen.getAllByRole("link", { name: /Open the demo/ });
  expect(demoLinks.length).toBeGreaterThan(0);
  expect(demoLinks.every((a) => a.getAttribute("href") === "/demo")).toBe(true);
  expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe(
    "#how-it-works",
  );
});

it("orders the page: guarantees, how it works, recipes, closing", async () => {
  render(<Home />);
  await screen.findByRole("heading", { level: 2, name: fixtureRecipe.name });
  const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(h2).toEqual(["Three steps. One guarantee.", fixtureRecipe.name, CLOSING_TITLE]);
  const ticker = screen.getByRole("region", { name: "Guarantees" });
  const how = document.getElementById("how-it-works") as HTMLElement;
  expect(ticker.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
