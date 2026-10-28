import { fixtureBuildResponse, fixtureRecipe, fixtureSetupReady } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import {
  canShock,
  DEMO_PATHS,
  describeRevert,
  describeShock,
  describeSpent,
  formatFee,
  mockPaymentNote,
  secondsLeft,
  shockTrend,
  slippageLabel,
  stepAnnouncement,
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
    [6, "setup"],
    [7, "guard"],
  ] as const)("tags step %i as %s", (index, tag) => {
    expect(stepTag(step(index), guard)).toBe(tag);
  });

  it("tags a setup after the assert as cleanup", () => {
    const late = { ...step(0), index: guard.assertIndex + 1 };
    expect(stepTag(late, guard)).toBe("cleanup");
  });

  it("keeps token setup between snapshot and assert as setup (real tx of PR #51)", () => {
    const real = { ...guard, snapshotIndex: 0, assertIndex: 10 };
    expect(stepTag({ ...step(0), index: 1 }, real)).toBe("setup");
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

  it("tells a guard revert as protection, with what it stopped", () => {
    const copy = describeRevert(run, {
      instructionIndex: guard.assertIndex,
      guard: { received: 9_100_000n, min: 9_950_000n },
    });
    expect(copy.title).toBe("The guard protected the agent");
    expect(copy.figures).toEqual({ received: "9.1", minimum: "9.95", shortfall: "0.85" });
    expect(copy.detail).toContain("9.95 demo USDC");
  });

  it("takes the minimum the chain read, not the one the build promised", () => {
    const copy = describeRevert(run, {
      instructionIndex: guard.assertIndex,
      guard: { received: 9_100_000n, min: 9_500_000n },
    });
    expect(copy.figures).toEqual({ received: "9.1", minimum: "9.5", shortfall: "0.4" });
    expect(copy.detail).toContain("9.5 demo USDC minimum");
  });

  it("never reports a negative shortfall", () => {
    const copy = describeRevert(run, {
      instructionIndex: guard.assertIndex,
      guard: { received: 10_000_000n, min: 9_950_000n },
    });
    expect(copy.figures?.shortfall).toBe("0");
  });

  it("names the failed step and never says guard when another instruction failed", () => {
    const copy = describeRevert(run, { instructionIndex: 3, guard: null });
    expect(copy.byGuard).toBe(false);
    expect(copy.title).toContain("Step 3");
    expect(copy.title).toContain("Collect fees");
    expect(copy.figures).toBeNull();
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

describe("describeShock", () => {
  it("names the pair and the change", () => {
    expect(describeShock("150.00", "141.00")).toBe("SOL/demo USDC 150.00 → 141.00 (-6%)");
    expect(describeShock("150.00", "155.00")).toBe("SOL/demo USDC 150.00 → 155.00 (+3.3%)");
  });

  it("leaves the change out when a price is not usable", () => {
    expect(describeShock("abc", "141.00")).toBe("SOL/demo USDC abc → 141.00");
    expect(describeShock("0", "1")).toBe("SOL/demo USDC 0 → 1");
  });
});

describe("shockTrend", () => {
  it("says which way the price moved", () => {
    expect(shockTrend("150.00", "141.00")).toBe("down");
    expect(shockTrend("150.00", "155.00")).toBe("up");
  });

  it("gives no direction when a price is not a number or nothing moved", () => {
    expect(shockTrend("abc", "141.00")).toBeNull();
    expect(shockTrend("150.00", "")).toBeNull();
    expect(shockTrend("150.00", "150.00")).toBeNull();
  });
});

describe("DEMO_PATHS", () => {
  // D15 y D10: el camino B no promete el revert; solo la cadena dice si el guard revirtió.
  it("does not promise a revert before the chain says so", () => {
    expect(DEMO_PATHS.B.line).toMatch(/if the agent would receive less than the minimum/);
  });
});

describe("mockPaymentNote", () => {
  it("says once what mock mode charges and what devnet would", () => {
    expect(mockPaymentNote("0.01 USDC")).toBe(
      "Simulated: mock mode charges nothing. In devnet mode the agent pays 0.01 USDC per request.",
    );
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

describe("stepAnnouncement", () => {
  it.each([
    ["idle", { status: "idle" }],
    ["paying", { status: "paying", agent: run.agent, position: run.position }],
    ["shocking", { status: "shocking", run, shockId: null }],
    ["signing", { status: "signing", run }],
  ] as const)("stays silent while %s (Busy already announces it)", (_, state) => {
    expect(stepAnnouncement(state)).toBe("");
  });

  it.each([
    [
      "setup",
      { status: "setup", agent: run.agent, setup: fixtureSetupReady },
      "Preparing the agent",
    ],
    ["built", { status: "built", run }, "Transaction ready to sign"],
    ["confirmed", { status: "confirmed", run, signature: "sig" }, "Executed as promised"],
    ["expired", { status: "expired", run }, "The transaction expired before it was sent"],
  ] as const)("announces %s", (_, state, text) => {
    expect(stepAnnouncement(state)).toBe(text);
  });

  it("announces a guard revert with its title", () => {
    const state: DemoState = {
      status: "reverted",
      run,
      signature: "sig",
      failure: { instructionIndex: guard.assertIndex, guard: { received: 1n, min: 2n } },
    };
    expect(stepAnnouncement(state)).toBe("The guard protected the agent");
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
