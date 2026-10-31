# Contrato de API (v3 — propuesta para la PR #1)

Fuente de verdad del contrato entre `apps/web` y `services/api`. La versión ejecutable vive en `packages/shared` (Zod); este documento la explica. Cambios respecto a la v2: proxy en Netlify, keypair del agente generado en el navegador (D13) y endpoints largos asíncronos (D25).

## Base

- El navegador llama a `/api/xargos/*` (route handler de Next en Netlify), que reenvía a `BACKEND_URL`, añade `DEMO_ACCESS_CODE` cuando toca y **reenvía intactas las cabeceras x402** (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`).
- Todo endpoint responde en **menos de 8 s**. Lo largo devuelve **202** y se consulta con polling (~1,5 s).
- Importes siempre en **unidades base como string** (USDC: 6 decimales; SOL: 9).

## Endpoints

| Método | Ruta                                   | x402                        | Respuesta             | Prioridad      |
| ------ | -------------------------------------- | --------------------------- | --------------------- | -------------- |
| GET    | `/recipes`                             | no                          | `Recipe[]`            | Imprescindible |
| POST   | `/recipes/:id/build`                   | **sí**                      | 402 → `BuildResponse` | Imprescindible |
| POST   | `/recipes/:id/build` con `{ buildId }` | no, si `now < rebuildUntil` | `BuildResponse`       | Imprescindible |
| POST   | `/demo/setup` `{ agent, accessCode? }` | no                          | **202** `{ agent }`   | Imprescindible |
| GET    | `/demo/setup/:agent`                   | no                          | `DemoSetupStatus`     | Imprescindible |
| POST   | `/demo/price-shock` `{ agent }`        | no                          | **202** `{ shockId }` | Imprescindible |
| GET    | `/demo/price-shock/:shockId`           | no                          | `PriceShockStatus`    | Imprescindible |
| GET    | `/executions/:buildId`                 | no                          | `Execution`           | Opcional       |

## Tipos

```ts
type Recipe = {
  id: string;
  name: string;
  description: string;
  price: { amount: string; mint: string };
};

type BuildRequest = { agent: string; position: string; buildId?: string };

type Step = {
  index: number; // índice real de la instrucción en la tx
  label: string; // "Withdraw liquidity", "Swap SOL → USDC", "Guard"
  protocol: string; // "Orca", "System", "Guard", "ComputeBudget", "AssociatedToken", "Token"
  programId: string;
  kind: "setup" | "action" | "guard";
};

type Guard = {
  programId: string;
  mint: string; // USDC devnet de Circle
  watchedAccount: string; // ATA de USDC del agente (la que lee el guard y el front para el saldo), NO la wallet
  minDelta: string; // mínimo a RECIBIR, unidades base
  snapshotIndex: number;
  assertIndex: number;
};

type BuildResponse = {
  buildId: string;
  recipeId: string;
  transaction: string; // base64, VersionedTransaction v0
  expiresAt: string; // ISO: caducidad del blockhash
  rebuildUntil: string; // ISO: rebuild gratis hasta aquí
  quote: { tokenOut: string; expectedOut: string; slippageBps: number };
  guard: Guard;
  steps: Step[];
  watchAccounts: string[];
};

type DemoSetupStatus = {
  agent: string;
  phase: "queued" | "funding_sol" | "funding_usdc" | "opening_position" | "ready" | "failed";
  position?: string; // NFT de la posición, ya del agente
  balances?: { sol: string; usdc: string };
  error?: ApiError;
};

type PriceShockStatus = {
  shockId: string;
  status: "pending" | "confirmed" | "failed";
  signature?: string;
  priceBefore?: string;
  priceAfter?: string;
  error?: ApiError;
};

type ErrorCode =
  | "PAYMENT_REQUIRED"
  | "PAYMENT_INVALID"
  | "BUILD_FAILED"
  | "BUILD_EXPIRED"
  | "REBUILD_WINDOW_CLOSED"
  | "RATE_LIMITED"
  | "ACCESS_DENIED"
  | "VALIDATION_ERROR"
  | "SETUP_FAILED"
  | "SHOCK_FAILED"
  | "INTERNAL";

type ApiError = { code: ErrorCode; message: string; details?: unknown };
```

Toda respuesta de error (4xx/5xx salvo el 402 de x402) tiene la forma `{ error: ApiError }`.

## Pagos fallidos

| Caso                                             | Respuesta                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Sin pago                                         | 402 con `PAYMENT-REQUIRED`                                                  |
| Pago inválido o insuficiente                     | 402 + `PAYMENT_INVALID`                                                     |
| Falla el build o la simulación (no por el guard) | 5xx + `BUILD_FAILED`; **no se liquida**                                     |
| Tx caducada                                      | Rebuild con `buildId` hasta `rebuildUntil`; después `REBUILD_WINDOW_CLOSED`. Se permite antes de `expiresAt` (no hace daño: la posición solo se cierra una vez), con un máximo de 5 por build |
| El resultado no llega a `minDelta`               | La tx revierte on-chain; la UI lo detecta con `getTransaction`              |

## Errores HTTP

El status de cada código vive en `ERROR_HTTP` (`packages/shared/src/errors.ts`), que es la fuente única: back, mocks y tests lo importan. Esta tabla lo resume.

| Código                                  | HTTP | Cuándo                                                      | ¿Reintentar igual? |
| --------------------------------------- | ---- | ----------------------------------------------------------- | ------------------ |
| `PAYMENT_REQUIRED` / `PAYMENT_INVALID`  | 402  | Sin pago / pago inválido o insuficiente                     | No                 |
| `VALIDATION_ERROR`                      | 400  | Petición mal formada                                        | No                 |
| `NOT_FOUND`                             | 404  | Ruta o recurso desconocido (agente sin setup, shock sin id) | No                 |
| `ACCESS_DENIED`                         | 403  | Código de acceso de la demo incorrecto                      | No                 |
| `REBUILD_WINDOW_CLOSED`                 | 410  | Ya pasó `rebuildUntil`: hay que pedir un build nuevo (pago) | No                 |
| `RATE_LIMITED`                          | 429  | Demasiadas peticiones; cabecera `Retry-After`               | Sí, tras esperar   |
| `BUILD_FAILED` / `INTERNAL`             | 500  | Falla el build o error interno; **no se liquida**           | Sí, con espera     |
| `SETUP_FAILED` / `SHOCK_FAILED`         | 500  | Normalmente viajan dentro del estado del job (`failed`)     | Sí                 |
| `BUILD_EXPIRED`                         | 410  | **Reservado**: el backend no lo emite (ver `rebuildUntil`)  | No                 |

Reglas:

- **Un error nunca se responde con 2xx/3xx.** x402 solo evita el cobro si la respuesta es ≥ 400 (D17); hay un test que lo vigila.
- **`details` solo con información segura:** campos inválidos en `VALIDATION_ERROR` y la espera en `RATE_LIMITED`. En `BUILD_FAILED` e `INTERNAL` el mensaje es genérico; la causa va a los logs con el `buildId`, nunca al cliente (ni stack traces, ni URLs de RPC con `api-key`).
- **`Cache-Control: no-store`** en toda respuesta de error (un `410` se puede cachear por defecto).
- Cualquier excepción no prevista acaba en `INTERNAL` 500 genérico, con el mismo formato `{ error }`.
- La pantalla de "caducada" la dibuja el front desde `expiresAt`; el backend solo responde `REBUILD_WINDOW_CLOSED` cuando se acaba la ventana gratuita.

Evolución prevista (RFC 9457, versionado, catálogo): ver [ADR 0002](adr/0002-error-contract.md).

## Revert parseable

`assert_min_delta` escribe `GUARD_FAIL received=<unidades> min=<unidades>` y devuelve el error `MinDeltaNotMet`. El front lo obtiene con `getTransaction(signature, { maxSupportedTransactionVersion: 0 })` → `meta.logMessages` y `meta.err` (`InstructionError: [índice, Custom(código)]`), y mapea el índice a `steps`.
