import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { fixtureRecipe, fixtureSetupReady } from "@xargos/shared";
import { delay, HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { createHandlers } from "@/mocks/handlers";
import { createMockSigner } from "./mock-signer";
import type { DemoSigner } from "./signer";
import { useDemo } from "./use-demo";

const server = setupServer();
const api = createApiClient({ baseUrl: "http://localhost/api/xargos" });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => server.resetHandlers(...createHandlers()));
afterEach(() => server.events.removeAllListeners());
// Sin `globals` en Vitest, Testing Library no desmonta los hooks: el desmontaje aborta lo que quede en marcha.
afterEach(cleanup);
afterAll(() => server.close());

function renderDemo(signer: DemoSigner | null = createMockSigner({ latencyMs: 0 })) {
  return renderHook(() =>
    useDemo({
      recipeId: fixtureRecipe.id,
      agent: fixtureSetupReady.agent,
      api,
      signer,
      pollIntervalMs: 1,
    }),
  );
}

type Demo = ReturnType<typeof renderDemo>["result"];

async function untilBuilt(result: Demo) {
  act(() => result.current.start());
  await waitFor(() => expect(result.current.state).toMatchObject({ setup: { phase: "ready" } }));
  act(() => result.current.pay());
  await waitFor(() => expect(result.current.state.status).toBe("built"));
}

describe("useDemo", () => {
  it("runs demo A: setup, pay, sign and confirm", async () => {
    const { result } = renderDemo();
    await untilBuilt(result);

    act(() => result.current.sign());
    await waitFor(() => expect(result.current.state.status).toBe("confirmed"));
  });

  it("runs demo B: the price shock makes the guard revert", async () => {
    const { result } = renderDemo();
    await untilBuilt(result);

    act(() => result.current.shock());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "built", run: { shock: {} } }),
    );
    act(() => result.current.sign());
    await waitFor(() => expect(result.current.state.status).toBe("reverted"));
    expect(result.current.state).toMatchObject({ failure: { guard: { min: 9_950_000n } } });
  });

  it("stops polling once the screen unmounts", async () => {
    let polls = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "GET" && request.url.includes("/demo/setup/")) polls++;
    });
    const { result, unmount } = renderDemo();
    act(() => result.current.start());
    await waitFor(() => expect(polls).toBeGreaterThan(0));

    unmount();
    const atUnmount = polls;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(polls).toBe(atUnmount);
  });

  it("does not let the old shock poll break a new run after a reset", async () => {
    const { result } = renderDemo();
    await untilBuilt(result);
    // El poll del shock falla tarde: si no se abortara, su FAILED caería en el setup nuevo.
    server.use(
      http.get("*/api/xargos/demo/price-shock/:shockId", async () => {
        await delay(100);
        return HttpResponse.json({ error: { code: "INTERNAL", message: "late" } }, { status: 500 });
      }),
    );

    act(() => result.current.shock());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "shocking", shockId: "shk_mock_1" }),
    );
    act(() => result.current.reset());
    act(() => result.current.start());
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(result.current.state.status).toBe("setup");
  });

  it("fails clearly when there is no signer yet (local/staging before F6)", async () => {
    const { result } = renderDemo(null);
    await untilBuilt(result);

    act(() => result.current.sign());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "error",
        error: { code: "INTERNAL", message: "No signer for this agent" },
      }),
    );
  });

  it("retries the payment without a new setup when the payment failed", async () => {
    server.use(
      http.post(
        "*/api/xargos/recipes/:recipeId/build",
        () => HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 }),
        { once: true },
      ),
    );
    const { result } = renderDemo();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toMatchObject({ setup: { phase: "ready" } }));
    act(() => result.current.pay());
    await waitFor(() => expect(result.current.state).toMatchObject({ failedAt: "paying" }));

    expect(result.current.canRetry).toBe(true);
    act(() => result.current.retry());
    expect(result.current.state.status).toBe("paying");
  });

  // Sin respuesta del backend no se sabe si x402 liquidó (D17): reintentar podría cobrar dos veces.
  it("does not offer a retry when the payment may have settled", async () => {
    server.use(
      http.post("*/api/xargos/recipes/:recipeId/build", () => HttpResponse.error(), { once: true }),
    );
    const { result } = renderDemo();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toMatchObject({ setup: { phase: "ready" } }));
    act(() => result.current.pay());
    await waitFor(() => expect(result.current.state).toMatchObject({ failedAt: "paying" }));

    expect(result.current.state).toMatchObject({ error: { unreachable: true } });
    expect(result.current.canRetry).toBe(false);
    act(() => result.current.retry());
    expect(result.current.state.status).toBe("error");
  });

  // Con x402 real (F8), volver a pagar tras un fallo de la firma o del shock cobraría dos veces.
  it("does not pay again when the failure came after the payment", async () => {
    const { result } = renderDemo(null);
    await untilBuilt(result);
    act(() => result.current.sign());
    await waitFor(() => expect(result.current.state).toMatchObject({ failedAt: "signing" }));

    expect(result.current.canRetry).toBe(false);
    act(() => result.current.retry());
    expect(result.current.state.status).toBe("error");
  });
});
