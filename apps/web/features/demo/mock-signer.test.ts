import {
  fixtureBuildResponse,
  fixtureGuardFailLogs,
  fixtureSetupReady,
  fixtureShockConfirmed,
  parseGuardFail,
} from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { createMockSigner } from "./mock-signer";
import type { Run } from "./types";

const run: Run = {
  agent: fixtureSetupReady.agent,
  position: fixtureSetupReady.position ?? "",
  build: fixtureBuildResponse,
};
const live = () => new AbortController().signal;

describe("createMockSigner", () => {
  it("confirms a run without a price shock (demo A)", async () => {
    const outcome = await createMockSigner()(run, live());
    expect(outcome.outcome).toBe("confirmed");
    expect(outcome.signature.startsWith("mock_")).toBe(true);
  });

  it("reverts by the guard after a price shock (demo B, D10)", async () => {
    const outcome = await createMockSigner()({ ...run, shock: fixtureShockConfirmed }, live());
    expect(outcome).toMatchObject({
      outcome: "reverted",
      failure: {
        instructionIndex: fixtureBuildResponse.guard.assertIndex,
        guard: parseGuardFail(fixtureGuardFailLogs),
      },
    });
  });

  it("rejects with AbortError when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createMockSigner({ latencyMs: 50 })(run, controller.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
  });
});
