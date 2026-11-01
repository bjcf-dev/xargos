import type { DemoSetupStatus } from "@xargos/shared";

const HOUR_MS = 60 * 60 * 1000;

/** In-memory state of the demo setups. One process on Railway is enough for the demo. */
export class SetupJobs {
  private readonly jobs = new Map<string, DemoSetupStatus>();
  private readonly createdAt = new Map<string, number>();

  constructor(
    private readonly maxJobs = 200,
    /** Jobs older than this are dropped, so the cap does not fill up until the next restart. */
    private readonly ttlMs = HOUR_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(agent: string): DemoSetupStatus | undefined {
    return this.jobs.get(agent);
  }

  /** Registers a new job. Returns false when the cap is reached (the caller answers RATE_LIMITED). */
  create(agent: string): boolean {
    this.purgeExpired();
    if (this.jobs.size >= this.maxJobs) return false;
    this.jobs.set(agent, { agent, phase: "queued" });
    this.createdAt.set(agent, this.now());
    return true;
  }

  /** Puts a failed job back to `queued` so it can run again. Any other job is left alone. */
  restart(agent: string): boolean {
    if (this.jobs.get(agent)?.phase !== "failed") return false;
    this.jobs.set(agent, { agent, phase: "queued" });
    this.createdAt.set(agent, this.now());
    return true;
  }

  update(agent: string, patch: Partial<Omit<DemoSetupStatus, "agent">>): void {
    const current = this.jobs.get(agent);
    if (current) this.jobs.set(agent, { ...current, ...patch });
  }

  get size(): number {
    return this.jobs.size;
  }

  private purgeExpired(): void {
    const limit = this.now() - this.ttlMs;
    for (const [agent, created] of this.createdAt) {
      if (created <= limit) {
        this.jobs.delete(agent);
        this.createdAt.delete(agent);
      }
    }
  }
}
