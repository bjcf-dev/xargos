import { describe, expect, it, vi } from "vitest";
import { SetupJobs } from "../store/setup-jobs";
import { runSetup, type SetupSteps } from "./setup-runner";

const AGENT = "AgentDemo1111111111111111111111111111111111";

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
  it("goes through the phases in order and ends ready with position and balances", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    const phases: string[] = [];
    const steps = fakeSteps({
      fundSol: async () => void phases.push(jobs.get(AGENT)?.phase ?? ""),
      fundUsdc: async () => void phases.push(jobs.get(AGENT)?.phase ?? ""),
      openPosition: async () => {
        phases.push(jobs.get(AGENT)?.phase ?? "");
        return { position: "PositionMint" };
      },
    });

    await runSetup(jobs, steps, AGENT);

    expect(phases).toEqual(["funding_sol", "funding_usdc", "opening_position"]);
    expect(jobs.get(AGENT)).toEqual({
      agent: AGENT,
      phase: "ready",
      position: "PositionMint",
      balances: { sol: "20000000", usdc: "50000" },
    });
  });

  it("initializes the snapshot only after the position exists", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    const order: string[] = [];
    await runSetup(
      jobs,
      fakeSteps({
        openPosition: async () => {
          order.push("position");
          return { position: "P" };
        },
        initSnapshot: async () => void order.push("snapshot"),
      }),
      AGENT,
    );
    expect(order).toEqual(["position", "snapshot"]);
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

  it("does not open a position when funding failed", async () => {
    const jobs = new SetupJobs();
    jobs.create(AGENT);
    const openPosition = vi.fn(async () => ({ position: "P" }));
    await runSetup(
      jobs,
      fakeSteps({
        fundSol: async () => {
          throw new Error("no funds");
        },
        openPosition,
      }),
      AGENT,
    );
    expect(openPosition).not.toHaveBeenCalled();
  });
});
