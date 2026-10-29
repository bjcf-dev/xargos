import { describe, expect, it } from "vitest";
import { SetupJobs } from "./setup-jobs";

describe("SetupJobs", () => {
  it("creates a queued job and finds it by agent", () => {
    const jobs = new SetupJobs();
    expect(jobs.create("agentA")).toBe(true);
    expect(jobs.get("agentA")).toEqual({ agent: "agentA", phase: "queued" });
    expect(jobs.get("other")).toBeUndefined();
  });

  it("merges updates into the job and ignores unknown agents", () => {
    const jobs = new SetupJobs();
    jobs.create("agentA");
    jobs.update("agentA", { phase: "ready", position: "pos1" });
    jobs.update("ghost", { phase: "ready" });
    expect(jobs.get("agentA")).toEqual({ agent: "agentA", phase: "ready", position: "pos1" });
    expect(jobs.get("ghost")).toBeUndefined();
  });

  it("refuses new jobs once the cap is reached", () => {
    const jobs = new SetupJobs(2);
    expect(jobs.create("a")).toBe(true);
    expect(jobs.create("b")).toBe(true);
    expect(jobs.create("c")).toBe(false);
    expect(jobs.size).toBe(2);
  });

  it("drops jobs older than the ttl so the cap frees up", () => {
    let now = 0;
    const jobs = new SetupJobs(1, 1_000, () => now);
    expect(jobs.create("a")).toBe(true);
    expect(jobs.create("b")).toBe(false);
    now = 1_000;
    expect(jobs.create("b")).toBe(true);
    expect(jobs.get("a")).toBeUndefined();
  });

  it("restarts only a failed job", () => {
    const jobs = new SetupJobs();
    jobs.create("a");
    expect(jobs.restart("a")).toBe(false);
    jobs.update("a", { phase: "failed", error: { code: "SETUP_FAILED", message: "x" } });
    expect(jobs.restart("a")).toBe(true);
    expect(jobs.get("a")).toEqual({ agent: "a", phase: "queued" });
    expect(jobs.restart("ghost")).toBe(false);
  });
});
