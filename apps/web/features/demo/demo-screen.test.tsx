import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fixtureBuildResponse, fixtureRecipe } from "@xargos/shared";
import { delay, HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { createHandlers } from "@/mocks/handlers";
import { DemoScreen } from "./demo-screen";
import { createMockSigner } from "./mock-signer";

const server = setupServer();
const api = createApiClient({ baseUrl: "http://localhost/api/xargos" });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => server.resetHandlers(...createHandlers()));
// Sin `globals` en Vitest, Testing Library no limpia el DOM entre tests.
afterEach(cleanup);
afterAll(() => server.close());

const click = async (name: RegExp) => {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  fireEvent.click(button);
};
const noDevnetClaims = () => expect(document.body.textContent ?? "").not.toMatch(/on devnet/i);

describe("DemoScreen (mock mode)", () => {
  it("walks demo B to a guard revert that states what was spent", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/start demo/i);
    noDevnetClaims();
    await click(/pay & build/i);
    expect(await screen.findByText(/guaranteed minimum/i)).toBeDefined();
    noDevnetClaims();

    await click(/apply price shock first/i);
    expect(await screen.findByText(/price 150\.00 → 141\.00/i)).toBeDefined();
    await click(/sign & send/i);

    expect(await screen.findByText("Reverted by the guard")).toBeDefined();
    expect(screen.getAllByText(/0\.01 USDC/).length).toBeGreaterThan(0);
    noDevnetClaims();
  });

  it("walks demo A to a confirmation", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/start demo/i);
    await click(/pay & build/i);
    await click(/sign & send/i);

    expect(await screen.findByText("Executed as promised")).toBeDefined();
    expect(screen.queryByText(/reverted/i)).toBeNull();
  });

  // ADR 0003: lo del pool es un "demo USDC" propio; la comisión x402 sí es USDC de Circle.
  it("calls the pool token demo USDC and keeps x402 money in USDC", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/start demo/i);
    await click(/pay & build/i);
    expect(await screen.findByText(/guaranteed minimum/i)).toBeDefined();

    // El saldo del agente es el USDC de Circle con el que paga el x402 (#52: balances.usdc).
    expect(screen.getByText(/SOL · [\d.]+ USDC$/)).toBeDefined();
    expect(screen.getAllByText(/^[\d.]+ demo USDC$/)).toHaveLength(2);
    expect(screen.getByText(/than [\d.]+ demo USDC, the whole transaction reverts/)).toBeDefined();
    expect(screen.getByText("0.01 USDC per request, paid with x402.")).toBeDefined();

    await click(/sign & send/i);
    expect(await screen.findByText(/at least [\d.]+ demo USDC\./)).toBeDefined();
  });
  it("marks the transaction expired once expiresAt passes and blocks signing", async () => {
    // Solo se falsea Date: el reloj salta sin esperar la caducidad real; MSW y waitFor siguen con timers reales.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      server.use(
        http.post("*/api/xargos/recipes/:recipeId/build", () =>
          HttpResponse.json({
            ...fixtureBuildResponse,
            expiresAt: new Date(Date.now() + 30_000).toISOString(),
            rebuildUntil: new Date(Date.now() + 120_000).toISOString(),
          }),
        ),
      );
      render(
        <DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />,
      );

      await click(/start demo/i);
      await click(/pay & build/i);
      expect(await screen.findByText("Valid for 30s")).toBeDefined();

      vi.setSystemTime(Date.now() + 31_000);
      expect(await screen.findByText("Expired", {}, { timeout: 2_000 })).toBeDefined();
      expect(screen.getByRole("button", { name: /sign & send/i }).hasAttribute("disabled")).toBe(
        true,
      );
      expect(screen.getByRole("button", { name: /start over/i })).toBeDefined();
      expect(screen.queryByText(/not enough time left/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces the step in progress to screen readers", async () => {
    server.use(
      http.post("*/api/xargos/recipes/:recipeId/build", async () => {
        await delay(100);
        return HttpResponse.json(fixtureBuildResponse);
      }),
    );
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/start demo/i);
    await click(/pay & build/i);

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Paying and building the transaction…");
  });

  it("offers no retry once the payment is done, so nothing is charged twice", async () => {
    render(<DemoScreen api={api} signer={null} pollIntervalMs={1} />);

    await click(/start demo/i);
    await click(/pay & build/i);
    await click(/sign & send/i);

    expect(await screen.findByText("Signing arrives with F6")).toBeDefined();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /start over/i })).toBeDefined();
  });

  it("blocks the price shock when the transaction is about to expire", async () => {
    server.use(
      http.post("*/api/xargos/recipes/:recipeId/build", () =>
        HttpResponse.json({
          ...fixtureBuildResponse,
          expiresAt: new Date(Date.now() + 15_000).toISOString(),
          rebuildUntil: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
    );
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/start demo/i);
    await click(/pay & build/i);

    expect(await screen.findByText(/not enough time left for the price shock/i)).toBeDefined();
    const shock = screen.getByRole("button", { name: /apply price shock first/i });
    expect(shock.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /sign & send/i }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});

describe("DemoScreen recipe loading", () => {
  const RECIPES = "*/api/xargos/recipes";
  const other = { ...fixtureRecipe, id: "other", name: "Other" };

  it("shows the demo recipe even when another comes first", async () => {
    server.use(http.get(RECIPES, () => HttpResponse.json([other, fixtureRecipe])));
    render(<DemoScreen api={api} />);

    expect(await screen.findByRole("heading", { name: fixtureRecipe.name })).toBeDefined();
  });

  it("explains when the demo recipe is not available and retries", async () => {
    server.use(http.get(RECIPES, () => HttpResponse.json([]), { once: true }));
    render(<DemoScreen api={api} />);

    expect(await screen.findByText(/demo recipe is not available/i)).toBeDefined();
    await click(/try again/i);
    expect(await screen.findByRole("button", { name: /start demo/i })).toBeDefined();
  });

  it("offers a retry when the recipes fail to load", async () => {
    server.use(
      http.get(
        RECIPES,
        () => HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 }),
        { once: true },
      ),
    );
    render(<DemoScreen api={api} />);

    expect(await screen.findByText("The recipe could not be loaded")).toBeDefined();
    await click(/try again/i);
    expect(await screen.findByRole("button", { name: /start demo/i })).toBeDefined();
  });
});
