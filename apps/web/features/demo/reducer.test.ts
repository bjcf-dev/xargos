import { fixtureBuildResponse, fixtureSetupReady, fixtureShockConfirmed } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { demoReducer } from "./reducer";
import { type DemoEvent, type DemoState, initialDemoState } from "./types";

const AGENT = fixtureSetupReady.agent;
const POSITION = fixtureSetupReady.position ?? "";
const RECEIPT = "eyJzdWNjZXNzIjp0cnVlfQ";

const setup = (phase: "queued" | "funding_sol" | "ready"): DemoState => ({
  status: "setup",
  agent: AGENT,
  setup: phase === "ready" ? fixtureSetupReady : { agent: AGENT, phase },
});
const paying: DemoState = { status: "paying", agent: AGENT, position: POSITION };
const run = {
  agent: AGENT,
  position: POSITION,
  build: fixtureBuildResponse,
  paymentResponse: RECEIPT,
};
const built: DemoState = { status: "built", run };
const shocked = { ...fixtureShockConfirmed };
const SIGNATURE = "5txSignatureForTheRecipe";

describe("demoReducer: setup → paying → built", () => {
  it("starts the setup for the agent generated in the browser", () => {
    expect(demoReducer(initialDemoState, { type: "SETUP_STARTED", agent: AGENT })).toEqual({
      status: "setup",
      agent: AGENT,
      setup: { agent: AGENT, phase: "queued" },
    });
  });

  it("follows the setup phases while polling", () => {
    const progress = { agent: AGENT, phase: "funding_sol" } as const;
    expect(demoReducer(setup("queued"), { type: "SETUP_PROGRESS", setup: progress })).toEqual({
      status: "setup",
      agent: AGENT,
      setup: progress,
    });
  });

  it("turns a failed setup into an error with the backend's code", () => {
    const error = { code: "SETUP_FAILED", message: "Faucet empty" } as const;
    const next = demoReducer(setup("funding_sol"), {
      type: "SETUP_PROGRESS",
      setup: { agent: AGENT, phase: "failed", error },
    });
    expect(next).toEqual({ status: "error", error, failedAt: "setup", agent: AGENT });
  });

  it("falls back to SETUP_FAILED when a failed setup carries no error", () => {
    const next = demoReducer(setup("funding_sol"), {
      type: "SETUP_PROGRESS",
      setup: { agent: AGENT, phase: "failed" },
    });
    expect(next).toEqual({
      status: "error",
      error: { code: "SETUP_FAILED", message: "Demo setup failed" },
      failedAt: "setup",
      agent: AGENT,
    });
  });

  it("pays once the setup is ready with a position", () => {
    expect(demoReducer(setup("ready"), { type: "PAY" })).toEqual(paying);
  });

  it("keeps the x402 receipt with the build", () => {
    const next = demoReducer(paying, {
      type: "BUILT",
      build: fixtureBuildResponse,
      paymentResponse: RECEIPT,
    });
    expect(next).toEqual({
      status: "built",
      run: {
        agent: AGENT,
        position: POSITION,
        build: fixtureBuildResponse,
        paymentResponse: RECEIPT,
      },
    });
  });

  it("leaves paymentResponse out of the run when there is no receipt", () => {
    const next = demoReducer(paying, { type: "BUILT", build: fixtureBuildResponse });
    expect(next.status === "built" && "paymentResponse" in next.run).toBe(false);
  });

  it("turns a rejected payment into an error that remembers the agent", () => {
    const error = { code: "PAYMENT_INVALID", message: "Insufficient amount" } as const;
    expect(demoReducer(paying, { type: "FAILED", error })).toEqual({
      status: "error",
      error,
      failedAt: "paying",
      agent: AGENT,
    });
  });

  it("retries from scratch after an error", () => {
    const failed: DemoState = {
      status: "error",
      error: { code: "RATE_LIMITED", message: "Too many setups" },
      failedAt: "setup",
      agent: AGENT,
    };
    expect(demoReducer(failed, { type: "SETUP_STARTED", agent: AGENT }).status).toBe("setup");
  });

  it.each<DemoState>([initialDemoState, setup("funding_sol"), paying])(
    "resets to idle from %o",
    (state) => {
      expect(demoReducer(state, { type: "RESET" })).toEqual(initialDemoState);
    },
  );
});

describe("demoReducer: events that do not apply leave the state untouched", () => {
  const cases: Array<[string, DemoState, DemoEvent]> = [
    [
      "a late setup poll after RESET",
      initialDemoState,
      { type: "SETUP_PROGRESS", setup: fixtureSetupReady },
    ],
    [
      "a setup poll for another agent",
      setup("queued"),
      {
        type: "SETUP_PROGRESS",
        setup: { agent: "OtherAgent111111111111111111111111111111111", phase: "ready" },
      },
    ],
    ["a second click on Pay", paying, { type: "PAY" }],
    ["Pay while the setup is still funding", setup("funding_sol"), { type: "PAY" }],
    [
      "Pay on a ready setup without a position",
      { status: "setup", agent: AGENT, setup: { agent: AGENT, phase: "ready" } },
      { type: "PAY" },
    ],
    [
      "a failure while idle",
      initialDemoState,
      { type: "FAILED", error: { code: "INTERNAL", message: "x" } },
    ],
  ];

  it.each(cases)("%s", (_name, state, event) => {
    expect(demoReducer(state, event)).toBe(state);
  });
});

describe("demoReducer: price shock (demo B, D10) and signing", () => {
  const shocking: DemoState = { status: "shocking", run, shockId: shocked.shockId };
  const signing: DemoState = { status: "signing", run };

  it("starts the price shock on a built transaction", () => {
    expect(demoReducer(built, { type: "SHOCK_STARTED", shockId: shocked.shockId })).toEqual(
      shocking,
    );
  });

  it("goes back to built with the shock once it is confirmed", () => {
    expect(demoReducer(shocking, { type: "SHOCK_SETTLED", shock: shocked })).toEqual({
      status: "built",
      run,
      shock: shocked,
    });
  });

  it("keeps waiting while the shock is still pending", () => {
    const pending = { shockId: shocked.shockId, status: "pending" } as const;
    expect(demoReducer(shocking, { type: "SHOCK_SETTLED", shock: pending })).toBe(shocking);
  });

  it("turns a failed shock into an error with the backend's code", () => {
    const error = { code: "SHOCK_FAILED", message: "Did not confirm" } as const;
    const next = demoReducer(shocking, {
      type: "SHOCK_SETTLED",
      shock: { shockId: shocked.shockId, status: "failed", error },
    });
    expect(next).toEqual({ status: "error", error, failedAt: "shocking", agent: AGENT });
  });

  it("falls back to SHOCK_FAILED when a failed shock carries no error", () => {
    const next = demoReducer(shocking, {
      type: "SHOCK_SETTLED",
      shock: { shockId: shocked.shockId, status: "failed" },
    });
    expect(next).toMatchObject({
      status: "error",
      error: { code: "SHOCK_FAILED", message: "Price shock failed" },
    });
  });

  it("ignores a late result from another shock", () => {
    const other = { ...shocked, shockId: "shk_other" };
    expect(demoReducer(shocking, { type: "SHOCK_SETTLED", shock: other })).toBe(shocking);
  });

  it("allows a single shock per build", () => {
    const alreadyShocked: DemoState = { status: "built", run, shock: shocked };
    expect(demoReducer(alreadyShocked, { type: "SHOCK_STARTED", shockId: "shk_2" })).toBe(
      alreadyShocked,
    );
  });

  it("signs a built transaction", () => {
    expect(demoReducer(built, { type: "SIGN" })).toEqual(signing);
  });

  it("keeps the shock when signing after it (demo B)", () => {
    expect(demoReducer({ status: "built", run, shock: shocked }, { type: "SIGN" })).toEqual({
      status: "signing",
      run,
      shock: shocked,
    });
  });

  it("confirms with the transaction signature", () => {
    expect(demoReducer(signing, { type: "CONFIRMED", signature: SIGNATURE })).toEqual({
      status: "confirmed",
      run,
      signature: SIGNATURE,
    });
  });

  it.each([
    ["the guard failed", { instructionIndex: 7, guard: { received: 9_100_000n, min: 9_950_000n } }],
    ["another instruction failed (D15)", { instructionIndex: 3, guard: null }],
  ] as const)("records a revert as the chain reports it: %s", (_case, failure) => {
    expect(demoReducer(signing, { type: "REVERTED", signature: SIGNATURE, failure })).toEqual({
      status: "reverted",
      run,
      signature: SIGNATURE,
      failure,
    });
  });

  it("turns a failure while signing into an error", () => {
    const error = { code: "INTERNAL", message: "RPC down" } as const;
    expect(demoReducer(signing, { type: "FAILED", error })).toEqual({
      status: "error",
      error,
      failedAt: "signing",
      agent: AGENT,
    });
  });
});
