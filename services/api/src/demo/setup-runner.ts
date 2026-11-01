import type { DemoSetupStatus } from "@xargos/shared";
import { withTimeout } from "../http/timeout";
import type { SetupJobs } from "../store/setup-jobs";

/** What setup does on-chain. Injected so the phases can be tested without a network. */
export type SetupSteps = {
  fundSol(agent: string): Promise<void>;
  /** Creates the agent's token accounts and sends it the USDC it pays x402 with. */
  fundUsdc(agent: string): Promise<void>;
  /** Opens a small LP position and gives its NFT to the agent. Returns the position NFT mint. */
  openPosition(agent: string): Promise<{ position: string }>;
  initSnapshot(agent: string): Promise<void>;
  balances(agent: string): Promise<NonNullable<DemoSetupStatus["balances"]>>;
  /** Whether the agent still holds this position with liquidity (the demo closes it). */
  positionIsOpen(agent: string, position: string): Promise<boolean>;
};

export type Logger = { error(data: object, message: string): void };

/** A setup that hangs must end in `failed`, so the client can retry. The steps are repeatable. */
const SETUP_TIMEOUT_MS = 60_000;

/** Runs the setup and records the phases in the job store. Never throws: a failure ends in `failed`. */
export async function runSetup(
  jobs: SetupJobs,
  steps: SetupSteps,
  agent: string,
  log: Logger = { error: () => {} },
  timeoutMs: number = SETUP_TIMEOUT_MS,
): Promise<void> {
  try {
    await withTimeout(runPhases(jobs, steps, agent), timeoutMs);
  } catch (error) {
    // The cause goes to the log; the client only gets a generic message (no RPC details or keys).
    log.error({ agent, error: String(error) }, "demo setup failed");
    jobs.update(agent, {
      phase: "failed",
      error: { code: "SETUP_FAILED", message: "Demo setup failed. Try again in a moment." },
    });
  }
}

async function runPhases(jobs: SetupJobs, steps: SetupSteps, agent: string): Promise<void> {
  // The four on-chain steps do not depend on each other (the snapshot PDA only needs the agent
  // and the mint), so they start together; the phases follow whichever finishes in order.
  jobs.update(agent, { phase: "funding_sol" });
  const sol = steps.fundSol(agent);
  const usdc = steps.fundUsdc(agent);
  const position = steps.openPosition(agent);
  const snapshot = steps.initSnapshot(agent);
  // If an earlier await throws, the rest must not end up as unhandled rejections.
  for (const task of [sol, usdc, position, snapshot]) task.catch(() => {});

  await sol;
  jobs.update(agent, { phase: "funding_usdc" });
  await usdc;
  jobs.update(agent, { phase: "opening_position" });
  const opened = await position;
  await snapshot;

  const balances = await steps.balances(agent);
  jobs.update(agent, { phase: "ready", position: opened.position, balances });
}
