# xARGOS

**Multi-step DeFi recipes for AI agents, paid per request with x402 on Solana. Kept as promised, or not executed at all.**

> Encode Solana Hackathon 2026 · Challenge: _Best Use of x402 on Solana_ · 🚧 Checkpoint 1: work in progress

## The problem

AI agents that manage funds on Solana often need multi-step operations: exit an Orca LP position, collect fees, swap the other token to USDC. Building that transaction correctly is hard, and each step only checks its own minimum, so the combined result can come out much worse than expected.

## What xARGOS does

1. The agent asks for a recipe and pays a small fee per request with **x402** (USDC, no accounts or API keys).
2. It receives the full **ready-to-sign transaction**.
3. The transaction starts with `snapshot` and ends with `assert_min_delta` from our **guard program**: if the agent receives less than the promised minimum, **Solana reverts the whole transaction**.

No custody, no escrow: the guarantee is enforced by the chain.

## Status (checkpoint 1)

All on **devnet**. Evidence is a transaction signature or a test, never a claim.

| Piece | State | Evidence |
| ----- | ----- | -------- |
| Guard program (`snapshot`, `assert_min_delta`) | Deployed | `97YMLtF9e6tW3e2ynHASe4qCB2e8uGnyGh5AmJNkJmCm`; LiteSVM tests in `programs/guard/tests` |
| Own Orca pool (wSOL / demo USDC) | Live | Pool `3qTZVVZbPmCGE3h3GpGxNw6B3F6Z2NdYJeWiv4Kw38pS`; creation, position and swap transactions in [ADR 0003](docs/adr/0003-own-demo-usdc-pool.md) |
| x402 payment verified and settled | Done in the spike | [`3q2HbKhx…cSQRq`](https://explorer.solana.com/tx/3q2HbKhxgbRDW86HkNo3F1wPFUfSwcNHzmxaNY4SAZxFApWzz9Nh2K2nrfrL7uDKWkHMW4qRC1aU2tvZQFcfSQRq?cluster=devnet), see [ADR 0001](docs/adr/0001-x402-self-facilitation.md) |
| Paid `POST /recipes/:id/build` (verify → build → simulate → settle) | Implemented, tested with a fake facilitator | `services/api/src/routes/recipes.test.ts` |
| Price shock (demo B) and free rebuild | Implemented, tested | `services/api/src/routes/shock.test.ts` |
| Demo A end to end through the paid route | **Not demonstrated yet** | No signature to show; this README will link it when there is one |
| Demo B revert on devnet | **Not demonstrated yet** | Same |

## How Solana makes it possible

- **Atomic transactions:** every step succeeds together or none does.
- **x402 on Solana:** fast, cheap USDC payments over HTTP, verified and settled on-chain.
- **On-chain guard:** a tiny Anchor program that measures what the agent actually received inside the same transaction.

## Guard program

`programs/guard` (Anchor) has no custody and only reads token balances:

- `snapshot` stores the agent's USDC balance and the slot in a PDA.
- `assert_min_delta(min_delta)` requires the same slot, computes `received = balance − snapshot` and, below `min_delta`, logs `GUARD_FAIL received=… min=…` and fails with `MinDeltaNotMet`.
- Both check the owner, the mint and that the account is the agent's associated token account.

Why it is built this way: [docs/decisions.md](docs/decisions.md) (D5–D8).

## API

Full contract and error table: [docs/api-contract.md](docs/api-contract.md).

| Method | Route | x402 | Answer |
| ------ | ----- | ---- | ------ |
| GET | `/recipes` | no | Recipe list with price |
| POST | `/recipes/:id/build` | **yes** | `BuildResponse`: the v0 transaction ready to sign, with `buildId` and `rebuildUntil` |
| POST | `/recipes/:id/build` with `{ buildId }` | no, until `rebuildUntil` | Rebuilt with the same promised minimum, no new payment |
| POST / GET | `/demo/setup`, `/demo/setup/:agent` | no (access code) | Funds a demo agent and opens its position, by phases |
| POST / GET | `/demo/price-shock`, `/demo/price-shock/:shockId` | no (access code) | Moves the demo pool price, then restores it after a cooldown |
| GET | `/health` | no | `{ ok: true }` |

## Failed payments

| Case                                   | What happens                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Invalid or insufficient payment        | 402 with the reason; nothing is built                                                          |
| We can't build or simulate the recipe  | The payment is **not settled**: the agent pays nothing                                         |
| The transaction expires before sending | Free rebuild for 120 s with the same `buildId`                                                 |
| The outcome misses the minimum         | The whole transaction reverts on-chain; the agent only pays the recipe fee and the network fee |

The first three rows are covered by tests in `services/api/src/routes/recipes.test.ts`. The last one is enforced by the guard and is not yet shown on devnet.

## Repository

```
apps/web/          Frontend (Next.js) — demo without wallet or faucet
services/api/      Backend (Hono) — x402 payments and recipe builder
programs/guard/    On-chain guard (Anchor)
packages/shared/   API contract shared by web and api (Zod)
scripts/           Devnet setup (Orca pool, lookup table, funding)
docs/              Design decisions and contract
```

## Getting started

Requirements: Node 22.23.4+ (security floor, see CLAUDE.md rule 12), pnpm (via `corepack enable`), [gitleaks](https://github.com/gitleaks/gitleaks). Backend only: Rust, Solana CLI (Anza), Anchor 1.0.x.

```bash
git clone <repo-url> && cd xargos
bash scripts/prepare-env.sh
cp .env.example .env    # not needed for the frontend mock mode
pnpm check
```

### Run the backend locally

```bash
pnpm --filter @xargos/api test     # unit tests, no network
pnpm --filter @xargos/api start    # needs RPC_URL, a payer key and the addresses in .env.example
```

The payer key comes from `PAYER_KEYPAIR_PATH`, a file outside the repo. Never commit it.

All on **Solana devnet**. Contribution flow: [CONTRIBUTING.md](CONTRIBUTING.md).

## Prior work & third-party code

Allowed by the organizers as long as it is disclosed (confirmed by Encode, Oct 20, 2026).
- Tooling and libraries: pnpm, TypeScript, Biome, Vitest, Zod, lefthook (see `package.json` files).
  Frontend (`apps/web`): Next.js, React, Tailwind CSS, next-themes, Base UI, lucide-react, class-variance-authority, cn, tw-animate-css, `@solana/kit`, `@solana-program/system`, Testing Library, jsdom, MSW.
  Backend (`services/api`): Hono, `@hono/node-server`, tsx, `@solana/kit`, `@solana-program/token`, and the official x402 packages `@x402/core`, `@x402/svm`, `@x402/hono`, `@x402/fetch`, and the Orca SDK `@orca-so/whirlpools` (devnet pool scripts in `services/api/src/scripts/orca`).
  Guard program (`programs/guard`): Rust, Anchor (`anchor-lang`, `anchor-spl`), tests with LiteSVM (`litesvm`, `litesvm-token`), built with `anchor build`; the layout follows the `anchor init` template (Anchor CLI 1.0.1), with all program code written during the hackathon. Guard client (`packages/guard-client`): generated with [Codama](https://github.com/codama-idl/codama) (`codama`, `@codama/nodes-from-anchor`, `@codama/renderers-js`); `src/generated` is Codama output (MIT), regenerated with `pnpm --filter @xargos/guard-client generate`.
- Scaffolds:
  - `apps/web` started from the `nextjs` template of [`create-solana-dapp`](https://github.com/solana-foundation/create-solana-dapp) v4.8.5 ([solana-foundation/templates](https://github.com/solana-foundation/templates), MIT), trimmed: we kept the layout, theme provider/toggle, explorer helper and Next/PostCSS config, and dropped the wallet connection, demo actions, cluster selector and Surfpool tests.
  - `apps/web/components/ui/*`, `apps/web/components.json` and the theme tokens in `apps/web/app/globals.css` come from [shadcn/ui](https://ui.shadcn.com) (CLI v4.22.1, `base-nova` preset, MIT).
  - `apps/web/public/mockServiceWorker.js` is generated by [MSW](https://mswjs.io) v3.0.3 (`msw init`, MIT) and kept unmodified.
- Pre-existing utilities: none.

All other code was written during the hackathon (from Oct 12, 2026).

## Team

- **Billy** — backend, guard program
- **Leandro** — frontend
