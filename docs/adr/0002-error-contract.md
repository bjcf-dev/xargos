# ADR 0002 — Error contract: one source of truth, and the path to grow

- **Status:** accepted (24 Oct 2026)
- **Decision:** every API error has the shape `{ error: { code, message, details? } }`, and its HTTP status lives in one place: `ERROR_HTTP` in `packages/shared/src/errors.ts`. Back end, mocks and tests import it; the table in `docs/api-contract.md` only summarises it.

## Why

- **No drift.** `ERROR_HTTP` is a `Record<ErrorCode, …>`: adding a code without its status does not compile.
- **Payments are safe.** x402 only skips the charge when the response is >= 400 (see D17 and the settlement tests), so a test asserts that no error code maps to 2xx/3xx.
- **No leaks.** `details` carries only safe data (invalid fields, retry wait). Internal causes go to logs with the `buildId`.
- **Agents can decide.** `retryable` tells an AI agent whether repeating the same request later can work.

## Kept open on purpose (not built now)

We deliberately did not over-build for a three-week project, but the design does not block any of this:

| Future step | Why it is cheap to add later |
| --- | --- |
| **RFC 9457 problem details** (`application/problem+json`) | Our shape maps one to one: `code` → `type` (a URI), `message` → `title`/`detail`, `ERROR_HTTP.status` → `status`, `details` → extension members. It is a change in the single error handler; clients already branch on `code`. |
| **API versioning** (`/v1/...`) | Every path comes from `routes` in `packages/shared`, so adding a prefix is one change. The x402 resource URL (D20) must follow the public URL. |
| **Error catalog / generated docs** | `ERROR_HTTP` is the seed: the table in the contract can be generated from it, and entries can later gain a documentation URL. |
| **Request correlation** | Logs already carry `buildId` on every line; exposing it in error responses is a one-field addition if support needs it. |

## Not chosen now

Full RFC 9457 adoption, versioning and a catalog service: more surface to maintain and explain than this project needs. Revisit if the API gets external consumers beyond the demo.
