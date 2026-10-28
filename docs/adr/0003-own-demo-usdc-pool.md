# ADR 0003: own demo-USDC mint for the Orca pool (D11 plan B)

- **Decision:** the Orca devnet pool trades SOL against our own "demo USDC" mint, not Circle's USDC. x402 payments keep using Circle's devnet USDC.
- **Why:** every SOL/USDC (Circle) pool for all 10 tick spacings in Orca's devnet config already exists, created by other people. A shared pool cannot give the controlled price shock that D10 needs.
- **Cost:** the recipe's exit token is a demo mint, not the real USDC. The UI and README must say "demo USDC" for the pool leg.
- **Evidence (devnet):**
  - Demo mint `D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss`, 6 decimals, supply 1,000,000, mint authority = facilitator key. Tx `rQ3it1pt2Lsxdt2Zw5SmKNDA884fHCE9BDUnYY5bc88Jqvm6NCbSk5TRZowNXugexiks5RA6Xn5djghvUwXkLHb`.
  - Pool `3qTZVVZbPmCGE3h3GpGxNw6B3F6Z2NdYJeWiv4Kw38pS` (wSOL / demo USDC, tick spacing 64, initial price 150). Tx `2NgZZfcNarbYDfu1ih2FkwgDTvncFGhMy5it9YysnL5Mn2gbuJmDuAf4SJ2zNK6mTsTcEdfY5xH9A8ND3w9dpe4L`.
- **Pin:** `@solana-program/system` 0.12.x (peer Kit 6); newer versions need Kit 7/8.
