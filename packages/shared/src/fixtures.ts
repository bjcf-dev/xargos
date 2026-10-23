import type { BuildResponse, DemoSetupStatus, PriceShockStatus, Recipe } from "./contract.js";

/**
 * Datos de ejemplo VÁLIDOS según el contrato, para los mocks MSW del front y los tests.
 * Las direcciones son ficticias (formato base58 válido, sin cuentas reales detrás).
 */
const AGENT = "AgentDemo1111111111111111111111111111111111";
const USDC = "UsdcDemo11111111111111111111111111111111111";
const GUARD = "GuardDemo111111111111111111111111111111111";
const ORCA = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

export const fixtureRecipe: Recipe = {
  id: "exit-orca-lp-to-usdc",
  name: "Exit Orca LP → USDC",
  description: "Withdraw liquidity, collect fees and swap everything to USDC, guarded on-chain.",
  price: { amount: "10000", mint: USDC },
};

export const fixtureBuildResponse: BuildResponse = {
  buildId: "bld_demo_0001",
  recipeId: fixtureRecipe.id,
  transaction: "AQIDBA==",
  expiresAt: "2026-11-01T12:01:00.000Z",
  rebuildUntil: "2026-11-01T12:02:00.000Z",
  quote: { tokenOut: USDC, expectedOut: "10000000", slippageBps: 50 },
  guard: {
    programId: GUARD,
    mint: USDC,
    watchedAccount: AGENT,
    minDelta: "9950000",
    snapshotIndex: 2,
    assertIndex: 7,
  },
  steps: [
    {
      index: 0,
      label: "Compute budget",
      protocol: "ComputeBudget",
      programId: GUARD,
      kind: "setup",
    },
    {
      index: 1,
      label: "Create token accounts",
      protocol: "System",
      programId: GUARD,
      kind: "setup",
    },
    { index: 2, label: "Snapshot", protocol: "Guard", programId: GUARD, kind: "guard" },
    { index: 3, label: "Collect fees", protocol: "Orca", programId: ORCA, kind: "action" },
    { index: 4, label: "Withdraw liquidity", protocol: "Orca", programId: ORCA, kind: "action" },
    { index: 5, label: "Swap SOL → USDC", protocol: "Orca", programId: ORCA, kind: "action" },
    { index: 6, label: "Close wSOL", protocol: "System", programId: GUARD, kind: "setup" },
    {
      index: 7,
      label: "Assert received ≥ min",
      protocol: "Guard",
      programId: GUARD,
      kind: "guard",
    },
  ],
  watchAccounts: [AGENT],
};

export const fixtureSetupReady: DemoSetupStatus = {
  agent: AGENT,
  phase: "ready",
  position: "PositionDemo11111111111111111111111111111111",
  balances: { sol: "50000000", usdc: "0" },
};

export const fixtureShockConfirmed: PriceShockStatus = {
  shockId: "shk_demo_0001",
  status: "confirmed",
  signature: "5demoSignature",
  priceBefore: "150.00",
  priceAfter: "141.00",
};

export const fixtureGuardFailLogs: string[] = [
  "Program log: Instruction: AssertMinDelta",
  "Program log: GUARD_FAIL received=9100000 min=9950000",
];
