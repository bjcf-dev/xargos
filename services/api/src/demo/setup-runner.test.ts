import { describe, expect, it, vi } from "vitest";
import { SetupJobs } from "../store/setup-jobs";
import { runSetup, type SetupSteps } from "./setup-runner";

const AGENT = "AgentDemo1111111111111111111111111111111111";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeSteps(overrides: Partial<SetupSteps> = {}): SetupSteps {
  return {
    fundSol: async () => {},
    fundUsdc: async () => {},
    openPosition: async () => ({ position: "PositionMint" }),
    initSnapshot: async () => {},
    balances: async () => ({ sol: "20000000", usdc: "50000" }),
    ...overrides,
  };
}

describe("runSetup", () => {
  it("advances the phases as the steps finish and ends ready with position and balances", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    const sol = deferred<void>();
    const usdc = deferred<void>();
    const position = deferred<{ position: string }>();
    const run = runSetup(
      jobs,
      fakeSteps({
        fundSol: () => sol.promise,
        fundUsdc: () => usdc.promise,
        openPosition: () => position.promise,
      }),
      AGENT,
    );

    expect(jobs.get(AGENT)?.phase).toBe("funding_sol");
    sol.resolve();
    await vi.waitFor(() => expect(jobs.get(AGENT)?.phase).toBe("funding_usdc"));
    usdc.resolve();
    await vi.waitFor(() => expect(jobs.get(AGENT)?.phase).toBe("opening_position"));
    position.resolve({ position: "PositionMint" });
    await run;

    expect(jobs.get(AGENT)).toEqual({
      agent: AGENT,
      phase: "ready",
      position: "PositionMint",
      balances: { sol: "20000000", usdc: "50000" },
    });
  });

  it("starts all the on-chain steps together instead of one after another", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    const started: string[] = [];
    const never = new Promise<never>(() => {});
    void runSetup(
      jobs,
      fakeSteps({
        fundSol: () => {
          started.push("sol");
          return never;
        },
        fundUsdc: () => {
          started.push("usdc");
          return never;
        },
        openPosition: () => {
          started.push("position");
          return never;
        },
        initSnapshot: () => {
          started.push("snapshot");
          return never;
        },
      }),
      AGENT,
    );
    await Promise.resolve();
    expect(started).toEqual(["sol", "usdc", "position", "snapshot"]);
  });

  it("ends failed with a generic SETUP_FAILED and logs the real cause", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    const log = { error: vi.fn() };

    await runSetup(
      jobs,
      fakeSteps({
        fundUsdc: async () => {
          throw new Error("429 from https://rpc.example/?api-key=SECRET");
        },
      }),
      AGENT,
      log,
    );

    const job = jobs.get(AGENT);
    expect(job?.phase).toBe("failed");
    expect(job?.error?.code).toBe("SETUP_FAILED");
    expect(JSON.stringify(job)).not.toContain("SECRET");
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("ends failed when the snapshot step fails, even if the others finished", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    await runSetup(
      jobs,
      fakeSteps({
        initSnapshot: async () => {
          throw new Error("snapshot failed");
        },
      }),
      AGENT,
    );
    expect(jobs.get(AGENT)?.phase).toBe("failed");
  });
});
