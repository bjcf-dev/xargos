import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { fixtureSetupReady } from "@xargos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentKeyStore, createMemoryBackend } from "@/lib/solana/agent-key-store";
import type { SendRpc } from "@/lib/solana/send";
import { type UseAgentOptions, useAgent } from "./use-agent";

afterEach(cleanup);

function options(overrides: Partial<UseAgentOptions> = {}): UseAgentOptions {
  const store = createAgentKeyStore(createMemoryBackend(), { persistent: true });
  return {
    mode: "local",
    openStore: async () => store,
    ed25519: async () => true,
    rpc: () => ({}) as SendRpc,
    ...overrides,
  };
}

describe("useAgent", () => {
  it("mock mode uses the fixture agent", () => {
    const { result } = renderHook(() => useAgent({ mode: "mock" }));
    expect(result.current).toMatchObject({
      status: "ready",
      address: fixtureSetupReady.agent,
      signer: undefined,
    });
  });

  it("unsupported when Ed25519 is missing", async () => {
    const { result } = renderHook(() => useAgent(options({ ed25519: async () => false })));
    await waitFor(() => expect(result.current.status).toBe("unsupported"));
  });

  it("same address after remount", async () => {
    const shared = options();
    const first = renderHook(() => useAgent(shared));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    const address = first.result.current.status === "ready" ? first.result.current.address : "";
    first.unmount();

    const second = renderHook(() => useAgent(shared));
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    expect(second.result.current).toMatchObject({ address, persistent: true });
    expect(second.result.current.status === "ready" && second.result.current.signer).toBeTypeOf(
      "function",
    );
  });

  it("newAgent() gives another address", async () => {
    const { result } = renderHook(() => useAgent(options()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");
    const before = result.current.address;
    await result.current.newAgent();
    await waitFor(() =>
      expect(result.current.status === "ready" && result.current.address).not.toBe(before),
    );
  });

  it("fails visibly instead of loading forever when the key cannot be created", async () => {
    const store = createAgentKeyStore(createMemoryBackend(), {
      persistent: true,
      generate: () => Promise.reject(new Error("NotSupportedError")),
    });
    const { result } = renderHook(() => useAgent(options({ openStore: async () => store })));
    await waitFor(() => expect(result.current.status).toBe("failed"));
  });

  it("New agent fails visibly too, without an unhandled rejection", async () => {
    let calls = 0;
    const store = createAgentKeyStore(createMemoryBackend(), {
      persistent: true,
      // La primera clave sale; la del "New agent", no.
      generate: () => {
        calls += 1;
        return calls === 1
          ? (crypto.subtle.generateKey("Ed25519", false, [
              "sign",
              "verify",
            ]) as Promise<CryptoKeyPair>)
          : Promise.reject(new Error("NotSupportedError"));
      },
    });
    const { result } = renderHook(() => useAgent(options({ openStore: async () => store })));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");

    await expect(result.current.newAgent()).resolves.toBeUndefined();
    await waitFor(() => expect(result.current.status).toBe("failed"));
  });
});
