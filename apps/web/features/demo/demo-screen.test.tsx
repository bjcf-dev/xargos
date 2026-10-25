import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
});
