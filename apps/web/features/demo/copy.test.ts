import { fixtureBuildResponse, fixtureRecipe, fixtureSetupReady } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import {
  canShock,
  describeRevert,
  describeSpent,
  formatFee,
  secondsLeft,
  slippageLabel,
  stepTag,
  x402Timeline,
} from "./copy";
import type { DemoState, Run } from "./types";

const { guard, steps } = fixtureBuildResponse;
const step = (index: number) => {
  const found = steps.find((s) => s.index === index);
  if (!found) throw new Error(`fixture has no step ${index}`);
  return found;
};
const run: Run = {
  agent: fixtureSetupReady.agent,
  position: fixtureSetupReady.position ?? "",
  build: fixtureBuildResponse,
};
const states = (x402: Run): Record<"idle" | "paying" | "built", DemoState> => ({
  idle: { status: "idle" },
  paying: { status: "paying", agent: x402.agent, position: x402.position },
  built: { status: "built", run: x402 },
});

describe("stepTag", () => {
  it.each([
    [0, "setup"],
    [2, "guard"],
    [3, "action"],
    [6, "cleanup"],
    [7, "guard"],
  ] as const)("tags step %i as %s", (index, tag) => {
    expect(stepTag(step(index), guard)).toBe(tag);
  });
});

describe("slippageLabel", () => {
  it.each([
    [50, "0.5%"],
    [100, "1%"],
    [5, "0.05%"],
  ])("shows %i bps as %s", (bps, label) => {
    expect(slippageLabel(bps)).toBe(label);
  });
});

describe("secondsLeft", () => {
  const expiresAt = fixtureBuildResponse.expiresAt;

  it("counts whole seconds until expiresAt", () => {
    expect(secondsLeft(expiresAt, Date.parse(expiresAt) - 47_000)).toBe(47);
  });

  it("never goes below zero", () => {
    expect(secondsLeft(expiresAt, Date.parse(expiresAt) + 500)).toBe(0);
  });
});

describe("canShock", () => {
  it("allows the shock with 20 seconds or more left", () => {
    expect(canShock(20)).toBe(true);
  });

  it("blocks it below 20 seconds, at zero and without a transaction", () => {
    expect(canShock(19)).toBe(false);
    expect(canShock(0)).toBe(false);
    expect(canShock(null)).toBe(false);
  });
});

describe("describeRevert (D15)", () => {
  it("blames the guard only when the guard failed, with the measured amounts", () => {
    const copy = describeRevert(run, {
      instructionIndex: guard.assertIndex,
      guard: { received: 9_100_000n, min: 9_950_000n },
    });
    expect(copy.byGuard).toBe(true);
    // ADR 0003: el pool usa un USDC propio; solo la comisión x402 es USDC de Circle.
    expect(copy.detail).toContain("9.1 demo USDC");
    expect(copy.detail).toContain("9.95 demo USDC minimum");
  });

  it("names the failed step and never says guard when another instruction failed", () => {
    const copy = describeRevert(run, { instructionIndex: 3, guard: null });
    expect(copy.byGuard).toBe(false);
    expect(copy.title).toContain("Step 3");
    expect(copy.title).toContain("Collect fees");
    expect(`${copy.title} ${copy.detail}`).not.toMatch(/guard/i);
  });

  it("stays generic when the chain gives no instruction index", () => {
    const copy = describeRevert(run, { instructionIndex: null, guard: null });
    expect(copy.title).toBe("The transaction failed on-chain");
    expect(`${copy.title} ${copy.detail}`).not.toMatch(/guard/i);
  });
});

describe("formatFee", () => {
  it("formats the x402 recipe fee in USDC", () => {
    expect(formatFee(fixtureRecipe.price)).toBe("0.01 USDC");
  });
});

describe("describeSpent (D16)", () => {
  it("states the recipe fee and leaves the network fee open until it is read", () => {
    expect(describeSpent(fixtureRecipe.price, null)).toEqual({
      recipeFee: "0.01 USDC",
      networkFee: null,
    });
  });

  it("formats the network fee in SOL once known", () => {
    expect(describeSpent(fixtureRecipe.price, 5000n).networkFee).toBe("0.000005 SOL");
  });
});

describe("x402Timeline", () => {
  const byKey = (state: DemoState, mode: "mock" | "staging") =>
    Object.fromEntries(x402Timeline(state, mode).map((s) => [s.key, s.state]));

  it("marks the handshake as simulated in mock mode", () => {
    expect(byKey(states(run).paying, "mock")).toEqual({
      request: "done",
      challenge: "simulated",
      sign: "simulated",
      receipt: "simulated",
    });
  });

  it("waits on the 402 challenge while paying for real", () => {
    expect(byKey(states(run).paying, "staging")).toEqual({
      request: "done",
      challenge: "active",
      sign: "pending",
      receipt: "pending",
    });
  });

  it("completes once the receipt is on the run", () => {
    expect(byKey(states({ ...run, paymentResponse: "eyJ9" }).built, "staging")).toEqual({
      request: "done",
      challenge: "done",
      sign: "done",
      receipt: "done",
    });
  });

  it("leaves the receipt pending when a real build came back without one", () => {
    expect(byKey(states(run).built, "staging").receipt).toBe("pending");
  });

  it("shows nothing done before paying", () => {
    expect(new Set(Object.values(byKey(states(run).idle, "staging")))).toEqual(
      new Set(["pending"]),
    );
  });
});
