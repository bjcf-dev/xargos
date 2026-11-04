import type {
  BuildResponse,
  DemoSetupStatus,
  FundAssetsResponse,
  FundQuote,
  FundStatus,
  FundStatusResponse,
  PriceShockStatus,
  Recipe,
} from "./contract";
import type { ErrorResponse } from "./errors";

/**
 * Datos de ejemplo VÁLIDOS según el contrato, para los mocks MSW del front y los tests.
 * Las direcciones del agente, USDC y guard son ficticias (formato base58 válido, sin cuentas reales).
 * Las fechas (`expiresAt`, `rebuildUntil`) son absolutas: los mocks y tests deben reescribirlas con now + Δ.
 */
const AGENT = "AgentDemo1111111111111111111111111111111111";
const AGENT_USDC_ATA = "AgentUsdcAta1111111111111111111111111111111";
const USDC = "UsdcDemo11111111111111111111111111111111111";
const GUARD = "GuardDemo1111111111111111111111111111111111";
const ORCA = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
// Programas reales de Solana, para que los enlaces al explorer no engañen.
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const ASSOCIATED_TOKEN = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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
    watchedAccount: AGENT_USDC_ATA,
    minDelta: "9950000",
    snapshotIndex: 2,
    assertIndex: 7,
  },
  steps: [
    {
      index: 0,
      label: "Compute budget",
      protocol: "ComputeBudget",
      programId: COMPUTE_BUDGET,
      kind: "setup",
    },
    {
      index: 1,
      label: "Create token accounts",
      protocol: "AssociatedToken",
      programId: ASSOCIATED_TOKEN,
      kind: "setup",
    },
    { index: 2, label: "Snapshot", protocol: "Guard", programId: GUARD, kind: "guard" },
    { index: 3, label: "Collect fees", protocol: "Orca", programId: ORCA, kind: "action" },
    { index: 4, label: "Withdraw liquidity", protocol: "Orca", programId: ORCA, kind: "action" },
    { index: 5, label: "Swap SOL → USDC", protocol: "Orca", programId: ORCA, kind: "action" },
    { index: 6, label: "Close wSOL", protocol: "Token", programId: TOKEN_PROGRAM, kind: "setup" },
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
  position: "PositionDemo1111111111111111111111111111111",
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

// Estados intermedios del setup (polling cada ~1,5 s): la UI pinta una pantalla por fase.
export const fixtureSetupQueued: DemoSetupStatus = { agent: AGENT, phase: "queued" };

export const fixtureSetupFundingSol: DemoSetupStatus = { agent: AGENT, phase: "funding_sol" };

export const fixtureSetupFundingUsdc: DemoSetupStatus = {
  agent: AGENT,
  phase: "funding_usdc",
  balances: { sol: "50000000", usdc: "0" },
};

export const fixtureSetupFailed: DemoSetupStatus = {
  agent: AGENT,
  phase: "failed",
  error: { code: "SETUP_FAILED", message: "Could not fund the agent. Try again." },
};

// Price shock: pending mientras se confirma; failed si no llega a confirmarse.
export const fixtureShockPending: PriceShockStatus = {
  shockId: "shk_demo_0001",
  status: "pending",
};

export const fixtureShockFailed: PriceShockStatus = {
  shockId: "shk_demo_0001",
  status: "failed",
  error: { code: "SHOCK_FAILED", message: "The price shock did not confirm." },
};

// Respuestas de error del contrato (ErrorResponse) para los mocks de errores.
export const fixtureErrorRateLimited: ErrorResponse = {
  error: { code: "RATE_LIMITED", message: "Too many requests. Wait a moment and try again." },
};

export const fixtureErrorAccessDenied: ErrorResponse = {
  error: { code: "ACCESS_DENIED", message: "Invalid demo access code." },
};

export const fixtureErrorBuildExpired: ErrorResponse = {
  error: { code: "BUILD_EXPIRED", message: "The transaction expired before it was sent." },
};

export const fixtureErrorRebuildWindowClosed: ErrorResponse = {
  error: {
    code: "REBUILD_WINDOW_CLOSED",
    message: "The free rebuild window has closed. Request a new build.",
  },
};

// ---------- Fund (Aurora Intents) ----------
// Assets y cotización: respuestas reales del paso 0 (4 nov, `dry: true`, 2 USDC de Base a Solana).
// Los estados siguen saliendo de la referencia de la API (aún no hay swap real, B18); por eso la
// dirección de depósito, los plazos, los hashes y el destinatario son ficticios.

const FUND_RECIPIENT = "FundRecipientDemo111111111111111111111111111";
const FUND_REFUND_TO = "0x00000000000000000000000000000000000f00d1";
const FUND_DEPOSIT_ADDRESS = "0x00000000000000000000000000000000000de905";
const ORIGIN_TX = {
  hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  explorerUrl:
    "https://basescan.org/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
};
const DESTINATION_TX = {
  hash: "5FundDemoDestinationTxSignature",
  explorerUrl: "https://explorer.solana.com/tx/5FundDemoDestinationTxSignature",
};

export const fixtureFundAssets: FundAssetsResponse = {
  destination: {
    assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
    symbol: "USDC",
    blockchain: "sol",
    decimals: 6,
    priceUsd: 0.999489,
  },
  origins: [
    {
      assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      symbol: "USDC",
      blockchain: "base",
      decimals: 6,
      priceUsd: 0.999489,
    },
    {
      assetId: "nep141:base.omft.near",
      symbol: "ETH",
      blockchain: "base",
      decimals: 18,
      priceUsd: 2329.69,
    },
    {
      assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
      symbol: "USDC",
      blockchain: "arb",
      decimals: 6,
      priceUsd: 0.999489,
    },
    {
      assetId: "nep141:arb.omft.near",
      symbol: "ETH",
      blockchain: "arb",
      decimals: 18,
      priceUsd: 2329.69,
    },
    {
      assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
      symbol: "USDC",
      blockchain: "eth",
      decimals: 6,
      priceUsd: 0.999489,
    },
  ],
};

const QUOTE_BASE = {
  originAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  destinationAsset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  recipient: FUND_RECIPIENT,
  refundTo: FUND_REFUND_TO,
  amountIn: "2000000",
  amountInFormatted: "2.0",
  amountInUsd: "1.998978000000",
  amountOut: "1750908",
  amountOutFormatted: "1.750908",
  amountOutUsd: "1.750013286012",
  minAmountOut: "1733398",
  withdrawFee: "248701",
  refundFee: "2400",
  timeEstimateSeconds: 32,
};

/** Solo el precio (dry: true): sin dirección de depósito ni plazos. */
export const fixtureFundQuoteDry: FundQuote = { ...QUOTE_BASE, dry: true };

/** Cotización real: dirección de depósito y los dos plazos (`deadline` antes; sus valores: paso 0). */
export const fixtureFundQuote: FundQuote = {
  ...QUOTE_BASE,
  dry: false,
  depositAddress: FUND_DEPOSIT_ADDRESS,
  deadline: "2026-11-06T12:25:00.000Z",
  timeWhenInactive: "2026-11-06T12:30:00.000Z",
  correlationId: "afb003bb-a5a2-4c02-9d13-0e6510796e8d",
};

function fundStatus(
  status: FundStatus,
  extra: Partial<FundStatusResponse> = {},
): FundStatusResponse {
  return {
    depositAddress: FUND_DEPOSIT_ADDRESS,
    status,
    updatedAt: "2026-11-06T12:05:00.000Z",
    originTxs: [],
    destinationTxs: [],
    deadline: "2026-11-06T12:25:00.000Z",
    timeWhenInactive: "2026-11-06T12:30:00.000Z",
    ...extra,
  };
}

/** Un estado de Aurora por fixture: los handlers MSW recorren los 7. */
export const fixtureFundPendingDeposit = fundStatus("PENDING_DEPOSIT");
export const fixtureFundKnownDepositTx = fundStatus("KNOWN_DEPOSIT_TX", {
  originTxs: [ORIGIN_TX],
});
export const fixtureFundIncompleteDeposit = fundStatus("INCOMPLETE_DEPOSIT", {
  originTxs: [ORIGIN_TX],
  amountIn: "2000000",
  amountInFormatted: "2.0",
  depositedAmount: "1500000",
  depositedAmountFormatted: "1.5",
});
export const fixtureFundProcessing = fundStatus("PROCESSING", {
  originTxs: [ORIGIN_TX],
  amountIn: "2000000",
  amountInFormatted: "2.0",
});
export const fixtureFundSuccess = fundStatus("SUCCESS", {
  originTxs: [ORIGIN_TX],
  destinationTxs: [DESTINATION_TX],
  amountIn: "2000000",
  amountInFormatted: "2.0",
  amountOut: "1750908",
  amountOutFormatted: "1.750908",
});
export const fixtureFundRefunded = fundStatus("REFUNDED", {
  originTxs: [ORIGIN_TX],
  amountIn: "2000000",
  amountInFormatted: "2.0",
  depositedAmount: "1500000",
  depositedAmountFormatted: "1.5",
  refundedAmount: "1500000",
  refundedAmountFormatted: "1.5",
  refundReason: "Deposit below the quoted amount and not topped up before the deadline",
});
export const fixtureFundFailed = fundStatus("FAILED", { originTxs: [ORIGIN_TX] });

export const fixtureErrorFundQuoteFailed: ErrorResponse = {
  error: {
    code: "FUND_QUOTE_FAILED",
    message: "Aurora could not quote this swap. Check the amount and the addresses.",
  },
};

export const fixtureErrorFundUnavailable: ErrorResponse = {
  error: {
    code: "FUND_UNAVAILABLE",
    message: "Funding from other chains is not available right now. Try again in a moment.",
  },
};
