import { fixtureBuildResponse, fixtureSetupReady, fixtureShockConfirmed } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { demoReducer } from "./reducer";
import { type DemoEvent, type DemoState, initialDemoState, type Run } from "./types";

const AGENT = fixtureSetupReady.agent;
const POSITION = fixtureSetupReady.position ?? "";
const RECEIPT = "eyJzdWNjZXNzIjp0cnVlfQ";
const SIGNATURE = "5txSignatureForTheRecipe";
const EXPIRES_AT = Date.parse(fixtureBuildResponse.expiresAt);
const REBUILD_UNTIL = Date.parse(fixtureBuildResponse.rebuildUntil);

const setup = (phase: "queued" | "funding_sol" | "ready"): DemoState => ({
  status: "setup",
  agent: AGENT,
  setup: phase === "ready" ? fixtureSetupReady : { agent: AGENT, phase },
});
const paying: DemoState = { status: "paying", agent: AGENT, position: POSITION };
const run: Run = {
  agent: AGENT,
  position: POSITION,
  build: fixtureBuildResponse,
  paymentResponse: RECEIPT,
};
const shocked = { ...fixtureShockConfirmed };
const shockedRun: Run = { ...run, shock: shocked };
const built: DemoState = { status: "built", run };
const signing: DemoState = { status: "signing", run };

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

  it("turns a ready setup without a position into an error instead of waiting forever", () => {
    const next = demoReducer(setup("funding_sol"), {
      type: "SETUP_PROGRESS",
      setup: { agent: AGENT, phase: "ready" },
    });
    expect(next).toEqual({
      status: "error",
      error: { code: "SETUP_FAILED", message: "Demo setup finished without a position" },
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
    expect(next).toEqual({ status: "built", run });
  });

  it("leaves paymentResponse out of the run when there is no receipt", () => {
    const next = demoReducer(paying, { type: "BUILT", build: fixtureBuildResponse });
    expect(next.status).toBe("built");
    expect(next.status === "built" && "paymentResponse" in next.run).toBe(false);
  });

  it("keeps the Retry-After wait and the unreachable flag of a failure", () => {
    const error = {
      code: "RATE_LIMITED",
      message: "Slow down",
      retryAfterSeconds: 20,
      unreachable: true,
    } as const;
    const next = demoReducer(paying, { type: "FAILED", error });
    expect(next.status === "error" && next.error).toEqual(error);
  });

  it("turns a rejected payment into an error that keeps agent and position", () => {
    const error = { code: "PAYMENT_INVALID", message: "Insufficient amount" } as const;
    expect(demoReducer(paying, { type: "FAILED", error })).toEqual({
      status: "error",
      error,
      failedAt: "paying",
      agent: AGENT,
      position: POSITION,
    });
  });

  it("pays again from an error without a new setup when the position is known", () => {
    const failed: DemoState = {
      status: "error",
      error: { code: "PAYMENT_INVALID", message: "Insufficient amount" },
      failedAt: "paying",
      agent: AGENT,
      position: POSITION,
    };
    expect(demoReducer(failed, { type: "PAY" })).toEqual(paying);
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

  it.each<DemoState>([
    initialDemoState,
    setup("funding_sol"),
    paying,
    built,
    {
      status: "error",
      error: { code: "INTERNAL", message: "x" },
      failedAt: "paying",
      agent: AGENT,
    },
    {
      status: "reverted",
      run,
      signature: SIGNATURE,
      failure: { instructionIndex: 7, guard: { received: 1n, min: 2n } },
    },
    { status: "expired", run },
  ])("resets to idle from %o", (state) => {
    expect(demoReducer(state, { type: "RESET" })).toEqual(initialDemoState);
  });
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
    [
      "a setup poll that goes back to an earlier phase",
      { status: "setup", agent: AGENT, setup: { agent: AGENT, phase: "funding_usdc" } },
      { type: "SETUP_PROGRESS", setup: { agent: AGENT, phase: "funding_sol" } },
    ],
    [
      "a rebuilt transaction with another buildId (D19 keeps it)",
      { status: "rebuilding", run },
      { type: "BUILT", build: { ...fixtureBuildResponse, buildId: "bld_other" } },
    ],
    ["a second click on Pay", paying, { type: "PAY" }],
    ["Pay while the setup is still funding", setup("funding_sol"), { type: "PAY" }],
    [
      "Pay on a ready setup without a position",
      { status: "setup", agent: AGENT, setup: { agent: AGENT, phase: "ready" } },
      { type: "PAY" },
    ],
    [
      "Pay from an error that has no position",
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "x" },
        failedAt: "setup",
        agent: AGENT,
      },
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
  const requested: DemoState = { status: "shocking", run, shockId: null };
  const shocking: DemoState = { status: "shocking", run, shockId: shocked.shockId };

  it("enters shocking as soon as the shock is requested, before the 202", () => {
    expect(demoReducer(built, { type: "SHOCK_REQUESTED" })).toEqual(requested);
  });

  it("ignores a second click while the shock request is in flight", () => {
    expect(demoReducer(requested, { type: "SHOCK_REQUESTED" })).toBe(requested);
  });

  it("does not lose a failure of the shock request itself", () => {
    const error = { code: "RATE_LIMITED", message: "Too many shocks" } as const;
    expect(demoReducer(requested, { type: "FAILED", error })).toEqual({
      status: "error",
      error,
      failedAt: "shocking",
      agent: AGENT,
      position: POSITION,
    });
  });

  it("records the shockId once the backend accepts the shock", () => {
    expect(demoReducer(requested, { type: "SHOCK_ACCEPTED", shockId: shocked.shockId })).toEqual(
      shocking,
    );
  });

  it("goes back to built with the shock in the run once it is confirmed", () => {
    expect(demoReducer(shocking, { type: "SHOCK_SETTLED", shock: shocked })).toEqual({
      status: "built",
      run: shockedRun,
    });
  });

  it("keeps waiting while the shock is still pending", () => {
    const pending = { shockId: shocked.shockId, status: "pending" } as const;
    expect(demoReducer(shocking, { type: "SHOCK_SETTLED", shock: pending })).toBe(shocking);
  });

  it("ignores a shock result before the shock was accepted", () => {
    expect(demoReducer(requested, { type: "SHOCK_SETTLED", shock: shocked })).toBe(requested);
  });

  it("ignores a late result from another shock", () => {
    const other = { ...shocked, shockId: "shk_other" };
    expect(demoReducer(shocking, { type: "SHOCK_SETTLED", shock: other })).toBe(shocking);
  });

  it("turns a failed shock into an error with the backend's code", () => {
    const error = { code: "SHOCK_FAILED", message: "Did not confirm" } as const;
    const next = demoReducer(shocking, {
      type: "SHOCK_SETTLED",
      shock: { shockId: shocked.shockId, status: "failed", error },
    });
    expect(next).toEqual({
      status: "error",
      error,
      failedAt: "shocking",
      agent: AGENT,
      position: POSITION,
    });
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

  it("allows a single shock per run", () => {
    const alreadyShocked: DemoState = { status: "built", run: shockedRun };
    expect(demoReducer(alreadyShocked, { type: "SHOCK_REQUESTED" })).toBe(alreadyShocked);
  });

  it("signs a built transaction", () => {
    expect(demoReducer(built, { type: "SIGN" })).toEqual(signing);
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

  it("keeps the shock on the reverted run so demo B can show it", () => {
    const failure = { instructionIndex: 7, guard: { received: 9_100_000n, min: 9_950_000n } };
    const next = demoReducer(
      { status: "signing", run: shockedRun },
      { type: "REVERTED", signature: SIGNATURE, failure },
    );
    expect(next).toMatchObject({ status: "reverted", run: { shock: shocked } });
  });

  it("turns a failure while signing into an error", () => {
    const error = { code: "INTERNAL", message: "RPC down" } as const;
    expect(demoReducer(signing, { type: "FAILED", error })).toEqual({
      status: "error",
      error,
      failedAt: "signing",
      agent: AGENT,
      position: POSITION,
    });
  });
});

describe("demoReducer: expiry and free rebuild (D19)", () => {
  const expired: DemoState = { status: "expired", run };
  const rebuilding: DemoState = { status: "rebuilding", run };

  it.each<DemoState>([built, signing, { status: "shocking", run, shockId: shocked.shockId }])(
    "expires once expiresAt has passed (from %o)",
    (state) => {
      expect(demoReducer(state, { type: "EXPIRED", now: EXPIRES_AT })).toEqual(expired);
    },
  );

  it("ignores a stale expiry timer for an earlier transaction", () => {
    expect(demoReducer(built, { type: "EXPIRED", now: EXPIRES_AT - 1 })).toBe(built);
  });

  it("rebuilds for free while the window is open", () => {
    expect(demoReducer(expired, { type: "REBUILD", now: REBUILD_UNTIL - 1 })).toEqual(rebuilding);
  });

  it("closes the window exactly at rebuildUntil", () => {
    expect(demoReducer(expired, { type: "REBUILD", now: REBUILD_UNTIL })).toEqual({
      status: "error",
      error: { code: "REBUILD_WINDOW_CLOSED", message: "Rebuild window closed" },
      failedAt: "expired",
      agent: AGENT,
      position: POSITION,
    });
  });

  it("keeps the first payment's receipt on the rebuilt transaction", () => {
    const fresh = { ...fixtureBuildResponse, transaction: "BQYHCA==" };
    expect(demoReducer(rebuilding, { type: "BUILT", build: fresh })).toEqual({
      status: "built",
      run: { ...run, build: fresh },
    });
  });

  it("keeps the shock through expiry and rebuild, so no second shock is allowed", () => {
    const fresh = { ...fixtureBuildResponse, transaction: "BQYHCA==" };
    let state: DemoState = { status: "signing", run: shockedRun };
    state = demoReducer(state, { type: "EXPIRED", now: EXPIRES_AT });
    state = demoReducer(state, { type: "REBUILD", now: REBUILD_UNTIL - 1 });
    state = demoReducer(state, { type: "BUILT", build: fresh });

    expect(state).toEqual({ status: "built", run: { ...shockedRun, build: fresh } });
    expect(demoReducer(state, { type: "SHOCK_REQUESTED" })).toBe(state);
  });

  it("turns a rejected rebuild into an error", () => {
    const error = { code: "REBUILD_WINDOW_CLOSED", message: "Too late" } as const;
    expect(demoReducer(rebuilding, { type: "FAILED", error })).toEqual({
      status: "error",
      error,
      failedAt: "rebuilding",
      agent: AGENT,
      position: POSITION,
    });
  });

  it("ignores an expiry once the transaction is confirmed", () => {
    const confirmed: DemoState = { status: "confirmed", run, signature: SIGNATURE };
    expect(demoReducer(confirmed, { type: "EXPIRED", now: EXPIRES_AT })).toBe(confirmed);
  });
});
