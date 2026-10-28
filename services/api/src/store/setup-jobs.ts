import type { DemoSetupStatus } from "@xargos/shared";

/** In-memory state of the demo setups. One process on Railway is enough for the demo. */
export class SetupJobs {
  private readonly jobs = new Map<string, DemoSetupStatus>();

  constructor(private readonly maxJobs = 200) {}

  get(agent: string): DemoSetupStatus | undefined {
    return this.jobs.get(agent);
  }

  /** Registers a new job. Returns false when the cap is reached (the caller answers RATE_LIMITED). */
  create(agent: string): boolean {
    if (this.jobs.size >= this.maxJobs) return false;
    this.jobs.set(agent, { agent, phase: "queued" });
    return true;
  }

  update(agent: string, patch: Partial<Omit<DemoSetupStatus, "agent">>): void {
    const current = this.jobs.get(agent);
    if (current) this.jobs.set(agent, { ...current, ...patch });
  }

  get size(): number {
    return this.jobs.size;
  }
}
