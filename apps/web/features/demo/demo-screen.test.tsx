import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { fixtureBuildResponse, fixtureRecipe, fixtureSetupReady } from "@xargos/shared";
import { delay, HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { createAgentKeyStore, createMemoryBackend } from "@/lib/solana/agent-key-store";
import type { SendRpc } from "@/lib/solana/send";
import { createHandlers } from "@/mocks/handlers";
import { AgentCard } from "./agent-card";
import { mockPaymentNote } from "./copy";
import { DemoScreen } from "./demo-screen";
import { createMockSigner } from "./mock-signer";
import { ResultCard } from "./result-card";
import { initialDemoState } from "./types";
import type { UseAgentOptions } from "./use-agent";

const DEMO_AGENT = fixtureSetupReady.agent;

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
const actions = () =>
  within(screen.getByRole("group", { name: "Next step" })).getAllByRole("button");
const noDevnetClaims = () => expect(document.body.textContent ?? "").not.toMatch(/on devnet/i);

describe("DemoScreen (mock mode)", () => {
  it("walks demo B to a guard revert that states what was spent", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/price moves against/i);
    noDevnetClaims();
    await click(/pay & build/i);
    expect(await screen.findByText(/guaranteed minimum/i)).toBeDefined();
    noDevnetClaims();

    await click(/apply price shock first/i);
    expect(await screen.findByText("SOL/demo USDC 150.00 → 141.00 (-6%)")).toBeDefined();
    await click(/sign & send/i);

    expect(
      await screen.findByText("The guard protected the agent", { selector: "[data-step-title]" }),
    ).toBeDefined();
    // Protección, no error: el rojo queda solo en el paso que falló.
    const alert = screen
      .getByText("The guard protected the agent", { selector: "[data-step-title]" })
      .closest('[data-slot="alert"]');
    expect(alert?.className).not.toContain("text-destructive");
    expect(screen.getByText("0.85 demo USDC")).toBeDefined();
    // Un solo texto para el coste del pago en mock: la línea de tiempo y el resultado dicen lo mismo.
    expect(screen.getAllByText(mockPaymentNote("0.01 USDC"))).toHaveLength(2);
    expect(screen.queryByText(/spent:/i)).toBeNull();
    expect(screen.getAllByText(/0\.01 USDC/).length).toBeGreaterThan(0);
    noDevnetClaims();
  });

  it("walks demo A to a confirmation", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/happy path/i);
    await click(/pay & build/i);
    await click(/sign & send/i);

    expect(
      await screen.findByText("Executed as promised", { selector: "[data-step-title]" }),
    ).toBeDefined();
    expect(screen.queryByText(/reverted/i)).toBeNull();
  });

  it("describes each demo path", async () => {
    render(<DemoScreen api={api} />);
    await screen.findByRole("group", { name: "Choose a demo path" });

    const pathA = screen.getByRole("button", { name: "Path A: happy path" });
    const description = document.getElementById(pathA.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("receives at least the guaranteed minimum");
    expect(
      screen.getByRole("button", { name: "Path B: price moves against the agent" }),
    ).toBeDefined();
  });

  it("path A leads with signing", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/happy path/i);
    await click(/pay & build/i);

    await screen.findByText(/guaranteed minimum/i);
    expect(actions()[0]?.textContent).toMatch(/sign & send/i);
  });

  it("path B leads with the price shock, then signing", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/price moves against/i);
    await click(/pay & build/i);

    await screen.findByText(/guaranteed minimum/i);
    expect(actions()[0]?.textContent).toMatch(/apply price shock first/i);
    await click(/apply price shock first/i);
    await screen.findByText(/150\.00 → 141\.00/);
    expect(actions()[0]?.textContent).toMatch(/sign & send/i);
  });

  it("path B leads with signing when there is no time left for the shock", async () => {
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
    await click(/price moves against/i);
    await click(/pay & build/i);

    expect(await screen.findByText(/not enough time left for the price shock/i)).toBeDefined();
    expect(actions()[0]?.textContent).toMatch(/sign & send/i);
  });

  it("start over brings back both paths", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/price moves against/i);
    await click(/pay & build/i);
    await click(/start over/i);

    expect(await screen.findByRole("button", { name: /happy path/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /price moves against/i })).toBeDefined();
  });

  it("does not move the focus on the first render", async () => {
    render(<DemoScreen api={api} />);
    await screen.findByRole("button", { name: /happy path/i });
    expect(document.activeElement).toBe(document.body);
  });

  it("announces the step and moves the focus to its title", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/happy path/i);
    await click(/pay & build/i);
    await waitFor(() =>
      expect(screen.getByTestId("step-announcement").textContent).toBe("Transaction ready to sign"),
    );
    await click(/sign & send/i);

    await waitFor(() => expect(document.activeElement?.textContent).toBe("Executed as promised"));
    // Un solo canal: ni la región ni un role="alert" repiten el título que ya tiene el foco.
    expect(screen.getByTestId("step-announcement").textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    // El foco se ve con teclado (no se quita el outline).
    expect(document.activeElement?.className ?? "").not.toContain("outline-none");

    await click(/start over/i);
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Run the recipe as an AI agent"),
    );
  });

  it("puts the next step right under the x402 payment", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/happy path/i);
    await click(/pay & build/i);

    const sign = await screen.findByRole("button", { name: /sign & send/i });
    const anatomy = screen.getByText("Transaction anatomy");
    expect(sign.compareDocumentPosition(anatomy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("compacts the agent card on phones once the setup is done", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/happy path/i);
    await click(/pay & build/i);
    await screen.findByRole("button", { name: /sign & send/i });

    expect(screen.getByText("Agent ready").closest("p")?.className).toContain("md:hidden");
    const phases = screen.getByText("Queued").closest("ol")?.className ?? "";
    expect(phases).toContain("hidden");
    expect(phases).toContain("md:flex");
  });

  it("keeps the x402 payment on screen above the result", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);
    await click(/happy path/i);
    await click(/pay & build/i);
    await click(/sign & send/i);

    const result = await screen.findByText("Executed as promised", {
      selector: "[data-step-title]",
    });
    const payment = screen.getByText("x402 payment");
    expect(payment.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ADR 0003: lo del pool es un "demo USDC" propio; la comisión x402 sí es USDC de Circle.
  it("calls the pool token demo USDC and keeps x402 money in USDC", async () => {
    render(<DemoScreen api={api} signer={createMockSigner({ latencyMs: 0 })} pollIntervalMs={1} />);

    await click(/happy path/i);
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

      await click(/happy path/i);
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

    await click(/happy path/i);
    await click(/pay & build/i);

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Paying and building the transaction…");
  });

  it("offers no retry once the payment is done, so nothing is charged twice", async () => {
    render(<DemoScreen api={api} signer={null} pollIntervalMs={1} />);

    await click(/happy path/i);
    await click(/pay & build/i);
    await click(/sign & send/i);

    expect(
      await screen.findByText("No signer for this agent", {
        selector: '[data-slot="alert-description"] p',
      }),
    ).toBeDefined();
    // Errores para personas: título claro y el código en pequeño.
    expect(
      screen.getByText("Something went wrong", { selector: "[data-step-title]" }),
    ).toBeDefined();
    expect(screen.getByText("INTERNAL").className).toContain("text-xs");
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /start over/i })).toBeDefined();
  });

  it("tells a rate-limited build with its wait and that nothing was charged", async () => {
    server.use(
      http.post("*/api/xargos/recipes/:id/build", () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Slow down" } },
          { status: 429, headers: { "retry-after": "20" } },
        ),
      ),
    );
    render(<DemoScreen api={api} signer={null} pollIntervalMs={1} />);

    await click(/happy path/i);
    await click(/pay & build/i);

    expect(
      await screen.findByText("Too many demos right now", { selector: "[data-step-title]" }),
    ).toBeDefined();
    expect(
      screen.getByText("Wait 20 seconds, then try again.", {
        selector: '[data-slot="alert-description"] p',
      }),
    ).toBeDefined();
    expect(screen.getByText(/nothing was charged/i)).toBeDefined();
    const link = screen.getByRole("link", { name: "How failed payments work" });
    expect(link.getAttribute("href")).toBe("/failed-payments");
    // Un 429 se puede repetir tras esperar (ERROR_HTTP: retryable).
    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });

  it("says the backend is not responding when the network fails", async () => {
    server.use(http.post("*/api/xargos/recipes/:id/build", () => HttpResponse.error()));
    render(<DemoScreen api={api} signer={null} pollIntervalMs={1} />);

    await click(/happy path/i);
    await click(/pay & build/i);

    expect(
      await screen.findByText("The demo backend is not responding", {
        selector: "[data-step-title]",
      }),
    ).toBeDefined();
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

    await click(/happy path/i);
    await click(/pay & build/i);

    expect(await screen.findByText(/not enough time left for the price shock/i)).toBeDefined();
    const shock = screen.getByRole("button", { name: /apply price shock first/i });
    expect(shock.hasAttribute("disabled")).toBe(true);
    const hint = document.getElementById(shock.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toContain("Not enough time left");
    expect(screen.getByRole("button", { name: /sign & send/i }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});

describe("AgentCard address", () => {
  it("labels the agent address as a demo address in mock mode", () => {
    render(<AgentCard state={initialDemoState} agent={DEMO_AGENT} setup={null} mode="mock" />);
    expect(screen.getByText(/^Demo address · /)).toBeDefined();
  });

  it("shows the plain address outside mock mode", () => {
    render(<AgentCard state={initialDemoState} agent={DEMO_AGENT} setup={null} mode="staging" />);
    expect(screen.queryByText(/demo address/i)).toBeNull();
  });
});

describe("ResultCard for an error after the build", () => {
  const error = {
    status: "error",
    error: { code: "INTERNAL", message: "Could not reach Solana devnet" },
    failedAt: "signing",
  } as const;

  it("says the fee was already paid, never that nothing was charged", () => {
    render(<ResultCard state={error} mode="local" price={fixtureRecipe.price} />);

    expect(screen.getByText(/already paid/i)).toBeDefined();
    expect(screen.queryByText(/nothing was charged/i)).toBeNull();
  });

  it("in mock mode says what mock mode charges instead", () => {
    render(<ResultCard state={error} mode="mock" price={fixtureRecipe.price} />);

    expect(screen.getByText(mockPaymentNote("0.01 USDC"))).toBeDefined();
    expect(screen.queryByText(/already paid/i)).toBeNull();
  });
});

// D15: un revert que no es del guard sigue en rojo, nombra el paso y no habla de "guard".
describe("ResultCard for a revert outside the guard", () => {
  it("stays red, names the step and never mentions the guard", () => {
    render(
      <ResultCard
        state={{
          status: "reverted",
          run: { agent: "agent", position: "position", build: fixtureBuildResponse },
          signature: "sig",
          failure: { instructionIndex: 3, guard: null },
        }}
        mode="mock"
        price={fixtureRecipe.price}
      />,
    );

    const title = screen.getByText(/Step 3 · Collect fees/);
    expect(title.closest('[data-slot="alert"]')?.className).toContain("text-destructive");
    expect(document.body.textContent).not.toMatch(/guard/i);
    expect(screen.queryByText(/shortfall/i)).toBeNull();
    expect(screen.getByRole("link", { name: "How failed payments work" })).toBeDefined();
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
    // No promete que se arregle solo: nombra el id que falta para poder revisar el backend.
    expect(screen.getByText(/exit-orca-lp-to-usdc/)).toBeDefined();
    expect(screen.queryByText(/in a moment/i)).toBeNull();
    await click(/try again/i);
    expect(await screen.findByRole("button", { name: /happy path/i })).toBeDefined();
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
    expect(await screen.findByRole("button", { name: /happy path/i })).toBeDefined();
  });
});

describe("DemoScreen (devnet modes)", () => {
  const agentOptions = ({ persistent = true, ed25519 = true } = {}): UseAgentOptions => {
    const store = createAgentKeyStore(createMemoryBackend(), { persistent });
    return {
      openStore: async () => store,
      ed25519: async () => ed25519,
      rpc: () => ({}) as SendRpc,
    };
  };

  it("shows New agent outside mock mode", async () => {
    render(<DemoScreen api={api} mode="local" agentOptions={agentOptions()} />);
    expect(await screen.findByRole("button", { name: /new agent/i })).toBeDefined();
    expect(screen.queryByText(/lasts until you reload/i)).toBeNull();
  });

  it("explains that the agent lasts until reload when not persistent", async () => {
    render(
      <DemoScreen api={api} mode="local" agentOptions={agentOptions({ persistent: false })} />,
    );
    expect(await screen.findByText(/lasts until you reload/i)).toBeDefined();
  });

  it("tells the browser is not supported", async () => {
    render(<DemoScreen api={api} mode="local" agentOptions={agentOptions({ ed25519: false })} />);
    const message = await screen.findByText(/browser cannot create the agent/i);
    expect(message.closest('[data-slot="alert"]')?.textContent).toMatch(
      /Chrome 137.*Firefox 129.*Safari 17/,
    );
    expect(screen.queryByRole("button", { name: /happy path/i })).toBeNull();
  });

  it("mock mode has no New agent button", async () => {
    render(<DemoScreen api={api} />);
    await screen.findByRole("button", { name: /happy path/i });
    expect(screen.queryByRole("button", { name: /new agent/i })).toBeNull();
  });
});
