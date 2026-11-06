import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { fixtureSetupReady } from "@xargos/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentAddress } from "./use-agent-address";

afterEach(cleanup);

describe("useAgentAddress", () => {
  it("is the fixture agent in mock mode, without reading the browser", () => {
    const read = vi.fn();
    const { result } = renderHook(() => useAgentAddress({ mode: "mock", read }));
    expect(result.current).toBe(fixtureSetupReady.agent);
    expect(read).not.toHaveBeenCalled();
  });

  it("is the address of the agent saved in this browser", async () => {
    const { result } = renderHook(() =>
      useAgentAddress({ mode: "staging", read: async () => "AgentAddress111" }),
    );
    await waitFor(() => expect(result.current).toBe("AgentAddress111"));
  });

  it("is undefined when there is no agent or it cannot be read", async () => {
    const none = vi.fn(async () => null);
    const { result } = renderHook(() => useAgentAddress({ mode: "staging", read: none }));
    await waitFor(() => expect(none).toHaveBeenCalled());
    expect(result.current).toBeUndefined();

    const broken = vi.fn(async () => {
      throw new Error("no IndexedDB");
    });
    const second = renderHook(() => useAgentAddress({ mode: "staging", read: broken }));
    await waitFor(() => expect(broken).toHaveBeenCalled());
    expect(second.result.current).toBeUndefined();
  });
});
