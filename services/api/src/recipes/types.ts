import type { Address, Instruction } from "@solana/kit";
import type { BuildResponse, Recipe as RecipeInfo, StepKind } from "@xargos/shared";

/** An instruction plus what the UI needs to show it (the `kind` drives what it may say, D15). */
export type RecipeStep = {
  instruction: Instruction;
  label: string;
  protocol: string;
  kind: StepKind;
};

export type BuildContext = {
  /** Agent wallet: owns the position and signs the transaction. */
  agent: Address;
  /** Mint of the position NFT (the contract calls it `position`). */
  position: Address;
};

export type BuiltRecipe = {
  steps: RecipeStep[];
  quote: BuildResponse["quote"];
  guard: Omit<BuildResponse["guard"], "snapshotIndex" | "assertIndex">;
};

/** A paid recipe: `info` is what GET /recipes lists, `build` assembles the instructions. */
export type Recipe = {
  info: RecipeInfo;
  build(context: BuildContext): Promise<BuiltRecipe>;
};
