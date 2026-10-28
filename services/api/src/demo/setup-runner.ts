import type { DemoSetupStatus } from "@xargos/shared";
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
};

export type Logger = { error(data: object, message: string): void };

/** Runs the phases in order and records them in the job store. Never throws: a failure ends in `failed`. */
export async function runSetup(
  jobs: SetupJobs,
  steps: SetupSteps,
  agent: string,
  log: Logger = { error: () => {} },
): Promise<void> {
  try {
    jobs.update(agent, { phase: "funding_sol" });
    await steps.fundSol(agent);

    jobs.update(agent, { phase: "funding_usdc" });
    await steps.fundUsdc(agent);

    jobs.update(agent, { phase: "opening_position" });
    const { position } = await steps.openPosition(agent);
    await steps.initSnapshot(agent);

    const balances = await steps.balances(agent);
    jobs.update(agent, { phase: "ready", position, balances });
  } catch (error) {
    // The cause goes to the log; the client only gets a generic message (no RPC details or keys).
    log.error({ agent, error: String(error) }, "demo setup failed");
    jobs.update(agent, {
      phase: "failed",
      error: { code: "SETUP_FAILED", message: "Demo setup failed. Try again in a moment." },
    });
  }
}
