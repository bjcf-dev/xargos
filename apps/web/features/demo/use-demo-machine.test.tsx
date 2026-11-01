import { act, renderHook } from "@testing-library/react";
import { fixtureSetupReady } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { useDemoMachine } from "./use-demo-machine";

describe("useDemoMachine", () => {
  it("starts idle and moves with dispatched events", () => {
    const { result } = renderHook(() => useDemoMachine());
    expect(result.current[0]).toEqual({ status: "idle" });

    act(() => result.current[1]({ type: "SETUP_STARTED", agent: fixtureSetupReady.agent }));

    expect(result.current[0].status).toBe("setup");
  });
});
