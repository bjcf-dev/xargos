import { WhirlpoolDeployment } from "@orca-so/whirlpools";
import type { Instruction } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import type { RecipeStep } from "../types";

const WHIRLPOOL_PROGRAM = WhirlpoolDeployment.devnet.programId;
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
// First byte of the SPL Token instruction data.
const TOKEN_CLOSE_ACCOUNT = 9;
const TOKEN_SYNC_NATIVE = 17;

type Action = { label: string; protocol: string };

/**
 * Tags one SDK instruction. Orca's own instructions are the action; the plumbing around them gets
 * a label by what it does, so a failure says "Unwrap SOL failed" and not a vague "token accounts".
 */
export function tagStep(instruction: Instruction, action: Action): RecipeStep {
  const program = instruction.programAddress;
  if (program === WHIRLPOOL_PROGRAM) return { instruction, kind: "action", ...action };

  const setup = (label: string, protocol: string): RecipeStep => ({
    instruction,
    kind: "setup",
    label,
    protocol,
  });

  if (program === TOKEN_PROGRAM_ADDRESS) {
    const type = instruction.data?.[0];
    if (type === TOKEN_CLOSE_ACCOUNT)
      return setup("Unwrap SOL (close the temporary account)", "SPL Token");
    if (type === TOKEN_SYNC_NATIVE) return setup("Wrap SOL", "SPL Token");
  }
  if (program === SYSTEM_PROGRAM) return setup("Wrap SOL", "System");
  if (program === ASSOCIATED_TOKEN_PROGRAM)
    return setup("Create token account", "SPL Associated Token");
  return setup("Prepare token accounts", "SPL Token");
}
