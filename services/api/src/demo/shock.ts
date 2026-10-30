import type { PriceShockStatus } from "@xargos/shared";
import type { Logger } from "./setup-runner";

/** What the shock does on-chain. Injected so the flow can be tested without a network. */
export type ShockSteps = {
  /** Sells SOL in the demo pool so the price falls; returns the tx and the prices around it. */
  shock(): Promise<{ signature: string; priceBefore: string; priceAfter: string }>;
  /** Buys the price back to its baseline, so the next demo starts from the same pool. */
  restore(): Promise<void>;
};

/** In-memory state of the shocks, by shockId. */
export class ShockJobs {
  private readonly jobs = new Map<string, PriceShockStatus>();

  create(shockId: string): void {
    this.jobs.set(shockId, { shockId, status: "pending" });
  }

  get(shockId: string): PriceShockStatus | undefined {
    return this.jobs.get(shockId);
  }

  update(shockId: string, patch: Partial<Omit<PriceShockStatus, "shockId">>): void {
    const current = this.jobs.get(shockId);
    if (current) this.jobs.set(shockId, { ...current, ...patch });
  }
}

/**
 * One shock at a time, and not again until the pool has been restored. A second shock on a pool
 * that is still low would not be a shock, and two demos would fight over the same price.
 */
export class ShockGate {
  private busyUntil = 0;

  constructor(
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryStart(): boolean {
    if (this.now() < this.busyUntil) return false;
    this.busyUntil = Number.POSITIVE_INFINITY; // running: released by `finish` or `release`
    return true;
  }

  /** The shock landed: the pool stays low (and locked) until the cooldown is over. */
  finish(): void {
    this.busyUntil = this.now() + this.cooldownMs;
  }

  /** The shock failed: nothing moved, so the next one may start right away. */
  release(): void {
    this.busyUntil = 0;
  }
}

/** Never throws: a failure ends the job as `failed`; a landed shock schedules the restore. */
export async function runShock(
  jobs: ShockJobs,
  gate: ShockGate,
  steps: ShockSteps,
  shockId: string,
  options: {
    cooldownMs: number;
    /** Injected so tests do not wait; defaults to setTimeout. */
    schedule?: (task: () => void, ms: number) => void;
    log?: Logger;
  },
): Promise<void> {
  const schedule = options.schedule ?? ((task, ms) => void setTimeout(task, ms).unref());
  try {
    const result = await steps.shock();
    jobs.update(shockId, { status: "confirmed", ...result });
    gate.finish();
    schedule(() => {
      steps.restore().catch((error: unknown) => {
        options.log?.error({ shockId, error: String(error) }, "pool restore failed");
      });
    }, options.cooldownMs);
  } catch (error) {
    options.log?.error({ shockId, error: String(error) }, "price shock failed");
    gate.release();
    jobs.update(shockId, {
      status: "failed",
      error: { code: "SHOCK_FAILED", message: "The price shock failed. Try again in a moment." },
    });
  }
}
