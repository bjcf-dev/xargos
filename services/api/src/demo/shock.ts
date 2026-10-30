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
 * One shock at a time, and not again until the pool has been RESTORED. A second shock on a pool
 * that is still low would not be a shock, and a shock that overlaps the restore cancels itself.
 */
export class ShockGate {
  private locked = false;

  tryStart(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  /** Opens the gate: the shock failed (nothing moved) or the pool is back at its baseline. */
  release(): void {
    this.locked = false;
  }
}

/** A restore that never answers (a lost confirmation) must not keep the demo locked forever. */
const RESTORE_TIMEOUT_MS = 45_000;
const RESTORE_ATTEMPTS = 3;
const RESTORE_RETRY_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Never throws: a failure ends the job as `failed`; a landed shock schedules the restore. */
export async function runShock(
  jobs: ShockJobs,
  gate: ShockGate,
  steps: ShockSteps,
  shockId: string,
  options: {
    cooldownMs: number;
    /** How long a restore may take before it counts as failed (and is retried). */
    restoreTimeoutMs?: number;
    /** Injected so tests do not wait; defaults to setTimeout. */
    schedule?: (task: () => void, ms: number) => void;
    log?: Logger;
  },
): Promise<void> {
  const schedule = options.schedule ?? ((task, ms) => void setTimeout(task, ms).unref());
  try {
    const result = await steps.shock();
    jobs.update(shockId, { status: "confirmed", ...result });
    // The gate stays locked: the pool is low until it is restored, and restoring takes place
    // after the free rebuild window so it cannot undo the shock before the agent signs.
    const restore = (attempt: number): void => {
      withTimeout(steps.restore(), options.restoreTimeoutMs ?? RESTORE_TIMEOUT_MS).then(
        () => gate.release(),
        (error: unknown) => {
          options.log?.error({ shockId, attempt, error: String(error) }, "pool restore failed");
          if (attempt < RESTORE_ATTEMPTS) schedule(() => restore(attempt + 1), RESTORE_RETRY_MS);
          else gate.release(); // do not lock the demo forever; the log says the pool needs a look
        },
      );
    };
    schedule(() => restore(1), options.cooldownMs);
  } catch (error) {
    options.log?.error({ shockId, error: String(error) }, "price shock failed");
    gate.release();
    jobs.update(shockId, {
      status: "failed",
      error: { code: "SHOCK_FAILED", message: "The price shock failed. Try again in a moment." },
    });
  }
}
