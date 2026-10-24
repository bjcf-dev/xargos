# ADR 0001 — x402 self-facilitation on devnet

- **Status:** accepted (spike B2, 24 Oct 2026)
- **Decision (D18):** the backend runs its own x402 facilitator (`x402Facilitator` + `@x402/svm/exact/facilitator`) instead of using Coinbase CDP.
- **Why:** no API key, no quota and no third-party dependency during the hackathon; payments are verified and settled with throwaway devnet keys. CDP stays as plan B (1,000 free settlements per month, then $0.001 each).
- **Evidence:** devnet settlement `3q2HbKhxgbRDW86HkNo3F1wPFUfSwcNHzmxaNY4SAZxFApWzz9Nh2K2nrfrL7uDKWkHMW4qRC1aU2tvZQFcfSQRq` (agent 20 → 19.99 USDC, payto 0 → 0.01, fee paid by the facilitator, so the agent needs no SOL).
- **Middleware behaviour:** `@x402/hono` 2.28.0 settles only after a handler answers below 400; a 4xx/5xx or a thrown error cancels the settlement (`services/api/src/spike/app.test.ts`).
- **Pin:** `@solana/kit` must stay on 6.x. `@x402/svm` 2.28.0 imports the facilitator public key as non-extractable, which Kit 8.x rejects, so every payment fails with `invalid_exact_svm_payload_signature_invalid`. Revisit when `@x402/svm` supports Kit 8.
- **Setup note:** the `payTo` wallet needs its USDC token account first (`setup-payto-ata.ts`); without it the simulation fails.
