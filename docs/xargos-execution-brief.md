# xARGOS — Execution brief (v2, común a backend y frontend)

**Proyecto:** recetas DeFi atómicas para agentes de IA, pagadas por petición con x402 en Solana
**Hackathon:** Encode Solana Hackathon 2026 · reto _Best Use of x402 on Solana_
**Equipo:** Billy (backend + programa on-chain) · Leandro (frontend)
**Ejecutores:** Claude Code (uno por persona), siguiendo este documento
**Versión:** v2.1 · 17 oct 2026 (Netlify en lugar de Vercel; CI y reglas explicadas)

| Fecha                     | Hito oficial                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| lun 19 oct 13:59 (Madrid) | Proyecto creado y equipo añadido ✅                                   |
| **lun 2 nov**             | Checkpoint intermedio                                                 |
| **lun 9 nov**             | Entrega final (demo, repo con README, vídeo 2–4 min, cómo usa Solana) |

> Este documento es la **fuente de verdad compartida**. Si algo aquí cambia, cambia por PR revisada por los dos.

---

## 0. Reglas no negociables (personas y ejecutores)

1. **Solo devnet.** Ningún RPC, mint ni clave de mainnet en el repo.
2. **Repo nuevo, separado de SAVE.** No se copian ficheros, claves, `.env` ni docs de SAVE. Se reutiliza conocimiento, no código.
3. **Cero secretos en archivos commiteados**, incluidos los `.md`. Claves, API keys y URLs de RPC con `api-key` se escriben como `***` o "ver `.env`". `.env` está en `.gitignore` desde el primer commit, y gitleaks lo vigila en local y en CI.
4. **Claves desechables de devnet**, generadas solo para xARGOS.
5. **Nada de este proyecto se despliega en las máquinas de SAVE.**
6. **Verificar contra la fuente, no suponer.** Nombres de paquetes, firmas de funciones y cuentas se comprueban en el `.d.ts` instalado o en la doc oficial antes de escribir encima.
7. **Nadie hace push a `develop` ni a `main`.** Todo entra por PR revisada por la otra persona (§7).
8. **Un hito solo está terminado con CI en verde y una prueba real en devnet** (firma en el explorer), no solo con "compila".
9. **Todo lo que no se escriba durante el hackathon se declara en el README**, en la sección "Prior work & third-party code": librerías open source, scaffolds (`create-solana-dapp`) y utilidades propias anteriores al 12 oct. Lo confirmó Giles (Encode) el 20 oct: está permitido siempre que se declare. Cada PR que incorpore algo de esto actualiza esa sección.

---

## 1. Qué construimos

Un servicio HTTP que vende, vía x402, una **transacción Solana compuesta lista para firmar**:

> Salir de una posición LP de Orca → cobrar comisiones → swap del SOL a USDC, con un **guard on-chain** final: si el agente recibe menos de `minDelta` USDC, revierte todo.

Más una web que deja al jurado probarlo **sin wallet ni faucet** en dos demos:
- **Demo A:** el agente paga, firma y recibe lo prometido.
- **Demo B:** tras un _price shock_, el guard revierte la tx entera (`GUARD_FAIL`); el agente solo pierde la comisión de red.

---

## 2. Stack común (fijado: no se cambia sin PR al brief)

| Capa                 | Elección                                                                                                          | Motivo                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Monorepo             | **pnpm workspaces**, Node 22 LTS, `packageManager` fijado en `package.json`                                       | Un solo lockfile y tipos compartidos                                                                |
| Lenguaje             | **TypeScript `strict`** en todo el código JS                                                                      | Contrato tipado de punta a punta                                                                    |
| SDK Solana           | **`@solana/kit`** (no `@solana/web3.js` v1)                                                                       | Lo usan el SDK actual de Orca y el que recomienda el hackathon; mezclarlos obliga a convertir tipos |
| Contrato API         | **Zod** en `packages/shared`                                                                                      | Valida en el back, valida en el front, alimenta los mocks                                           |
| Lint + formato       | **Biome** (una sola herramienta)                                                                                  | Menos configuración que ESLint + Prettier                                                           |
| Tests JS             | **Vitest** en back y front                                                                                        | Misma herramienta para los dos                                                                      |
| Hooks locales        | **lefthook** + **gitleaks**                                                                                       | Formato, mensaje de commit y secretos antes de que salgan del PC                                    |
| Programa             | **Anchor 1.0.x** + tests con **LiteSVM**                                                                          | Lo que ya dominas                                                                                   |
| Cliente del programa | **Codama** (IDL de Anchor → cliente Kit tipado)                                                                   | Sin codificar instrucciones a mano                                                                  |
| x402                 | Paquetes oficiales **`@x402/core`, `@x402/svm`** (+ `@x402/fetch` en el cliente)                                  | Verificar versión y API instalada en el spike                                                       |
| Backend              | **Hono** sobre Node, logs con **pino**                                                                            | Ligero, buen soporte de x402                                                                        |
| Frontend             | **Next.js (App Router)** partiendo de `create-solana-dapp`, **Tailwind + shadcn/ui**, **TanStack Query**, **MSW** | Scaffold oficial y mocks del mismo contrato                                                         |
| Hosting              | Back en **Railway o Fly**; front en **Netlify**                                                                   | Servidor persistente para el back; Netlify da una preview por PR                                    |

---

## 3. Estructura del repo y responsables

```
xargos/
  apps/web/              # Leandro — Next.js
  services/api/          # Billy  — Hono
  programs/guard/        # Billy  — Anchor
  packages/shared/       # LOS DOS — contrato (Zod, tipos, códigos de error, fixtures)
  scripts/               # Billy  — pool Orca devnet, ALT, fondeo
  docs/                  # este brief, ADRs cortas
  .github/               # CI, CODEOWNERS, plantilla de PR
  biome.json  lefthook.yml  pnpm-workspace.yaml  .env.example
```

**Regla de fronteras:** `apps/web` y `services/api` **solo** se comunican a través de `packages/shared`. Ninguno importa código del otro.

---

## 4. Contrato primero (`packages/shared`)

Es la pieza que os mantiene coordinados trabajando por separado.
- Contiene: **esquemas Zod** de cada petición y respuesta, **tipos inferidos** (`z.infer`), un **enum de códigos de error** (`PAYMENT_INVALID`, `BUILD_FAILED`, `BUILD_EXPIRED`, `GUARD_FAIL`, `RATE_LIMITED`, …) y **fixtures** de ejemplo válidos.
- Punto de partida: el "Contrato de API v2" de `revision-backend-plan-frontend-v2.md` (`GET /recipes`, `POST /recipes/:id/build`, `POST /demo/setup`, `GET /demo/setup/:agent`, `POST /demo/price-shock`, `GET /executions/:buildId`).
- **El back** valida con estos esquemas lo que recibe y, en sus tests, lo que responde.
- **El front** parsea cada respuesta con estos esquemas, y sus mocks MSW devuelven las fixtures.
- **Cambiar el contrato = PR propia, pequeña, solo de `packages/shared`**, aprobada por la otra persona antes de que cualquiera la use.

**Cambio propuesto al contrato v2 (acordar en la primera PR):** el **navegador genera el keypair del agente** (`generateKeyPairSigner` de Kit) y envía solo la pública a `POST /demo/setup`. La clave secreta del agente no pasa nunca por el servidor.

---

## 5. Arquitectura del backend (Billy)

```
services/api/src/
  index.ts            # arranque, config validada con Zod (falla si falta una variable)
  routes/             # finas: validan con shared y delegan; sin lógica
  payment/            # x402 explícito: verify → build → simulate → settle
  recipes/
    recipe.ts         # interfaz Recipe { id, quote(state), build(params) }
    exit-orca-lp/     # primera receta
  quote/              # funciones puras: expectedOut, minDelta (sin red)
  solana/             # rpc Kit, cliente Codama del guard, ALT, envío/confirmación
  demo/               # setup (por fases) y price-shock
  store/              # buildStore con caducidad (rebuild gratis 120 s)
```

**Patrones:**
- **Pago explícito.** El orden es verificar el pago, construir la tx, simularla y solo entonces liquidar. Si algo falla antes de liquidar, el agente no paga. No se confía en el middleware sin haber confirmado antes que cobra solo con respuestas 2xx.
- **Strategy para las recetas.** Añadir una receta nueva no toca las rutas.
- **Núcleo puro.** El cálculo de quote y `minDelta` no hace llamadas de red: se testea con datos fijos.
- **No custodial.** El backend no firma nunca la tx del agente; solo usa el `payer` para la demo.
- **Idempotencia por `buildId`.** El rebuild gratis usa el mismo `buildId` hasta `rebuildUntil`.
- **Logs estructurados** con `buildId` en cada línea, para seguir un pago de principio a fin.

### Programa guard

- `snapshot(agent_token_account)` es la primera instrucción. Guarda el saldo y el slot en la PDA `["snap", agent, mint]`.
- `assert_min_delta(min_delta)` es la última. Exige el mismo slot, calcula `received` y, si no llega al mínimo, `msg!("GUARD_FAIL received={} min={}")` y el error `MinDeltaNotMet`.
- Comprueba el owner y el mint de la cuenta. No custodia fondos.
- Tests con LiteSVM: delta suficiente · insuficiente · slot distinto · otro owner · otro mint.

### Receta y calibración

Instrucciones: ComputeBudget · ATAs idempotentes · **snapshot** · collect fees · decrease liquidity + close position · swap · cerrar wSOL · **assert_min_delta**. Cada una lleva su `kind` (`setup`, `guard` o `action`) en `steps`.
Los mínimos de cada paso de Orca son **holgados**; el `minDelta` del guard es el **estricto**. El price shock se dimensiona para que falle el guard y no el swap: se comprueba 5 veces seguidas. Si la tx pasa de 1232 bytes, se usa una ALT propia.

### Pagos fallidos (criterio del jurado)

| Caso                                             | Comportamiento                                      |
| ------------------------------------------------ | --------------------------------------------------- |
| Pago inválido o insuficiente                     | 402 con el motivo; no se construye nada             |
| Falla el build o la simulación (no por el guard) | No se liquida; error `BUILD_FAILED` legible         |
| La tx caduca antes de enviarse                   | Rebuild gratis con el mismo `buildId` durante 120 s |
| El resultado no llega a `minDelta`               | Revierte entera on-chain (`GUARD_FAIL`)             |

---

## 6. Arquitectura del frontend (Leandro)

```
apps/web/
  app/                         # rutas: /, /demo, /recipes
  app/api/xargos/[...path]/    # proxy hacia el backend (BFF)
  features/demo/               # máquina de estados, componentes, hooks
  features/recipes/
  lib/api/                     # ÚNICO cliente HTTP, tipado con shared
  lib/solana/                  # Kit: firmar, enviar, enlaces al explorer
  mocks/                       # handlers MSW con las fixtures de shared
  components/ui/               # shadcn
```

**Patrones:**
- **Proxy en Next (BFF).** El navegador solo llama a `/api/xargos/*`. El proxy añade el código de acceso de la demo y **reenvía intactas las cabeceras de x402** (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`). Ninguna clave sale del servidor.
- **Un solo cliente API.** Ningún componente hace `fetch` directo: todo pasa por `lib/api`, que parsea con Zod.
- **La demo como máquina de estados**, con una unión discriminada y `useReducer`: `idle → setup → paying → built → signing → confirmed | reverted(GUARD_FAIL) | expired → rebuilding`. Cada estado tiene su pantalla; eso es lo que se ve en el vídeo.
- **Tabla de errores.** Cada código de error de `shared` tiene su mensaje de UI.
- **Interruptor de modo de API:** `NEXT_PUBLIC_API_MODE=mock | local | staging`. Por defecto `mock` (MSW), para avanzar sin esperar al back.
- **Agente en el navegador.** Keypair desechable de devnet en `sessionStorage`, y pago con `@x402/fetch` firmado por ese keypair. Wallet Adapter solo es opcional, para probar con Phantom.
- Server Components para lo estático; Client Components solo en la demo.

---

## 7. Flujo de Git

### Ramas

| Rama                                                          | Qué es                                                   | Despliegue                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `main`                                                        | Lo que ve el jurado. Solo recibe PRs **desde `develop`** | Producción (devnet): Netlify prod + Railway prod                          |
| `develop`                                                     | Integración de los dos                                   | Staging (devnet): branch deploy de `develop` en Netlify + Railway staging |
| `<tipo>/<issue>-<area>-<descripcion>` (ver `CONTRIBUTING.md`) | Trabajo de cada uno, desde `develop`                     | Deploy preview de Netlify por PR (front)                                  |

### Commits pequeños por micro-hito

- Se hace commit **cada vez que una unidad pequeña funciona**: compila y su test pasa. Por ejemplo, "esquema de BuildResponse", "instrucción snapshot con su test" o "pantalla de error GUARD_FAIL".
- Formato **Conventional Commits**, de 72 caracteres como máximo:
  `tipo(scope): qué se hizo`
  - tipos: `feat` `fix` `refactor` `test` `docs` `chore` `ci` `build` `perf`
  - scopes: `api` `web` `guard` `shared` `scripts` `repo`
  - ejemplos: `feat(guard): add snapshot instruction with slot check` · `fix(web): show rebuild button when tx expires`
- El hook `commit-msg` rechaza los mensajes que no cumplan el formato.
- **Lo que de verdad evita el megacommit son las PRs pequeñas:** una issue = una PR, idealmente **menos de 400 líneas** sin contar el lockfile. Si crece más, se parte.

### Pull requests y revisión cruzada

- Las PRs de Leandro las revisa Billy, y las de Billy las revisa Leandro (CODEOWNERS lo asigna solo).
- Para mergear: **1 aprobación de la otra persona + CI en verde + conversaciones resueltas**. Un push nuevo invalida la aprobación anterior.
- **Plazo de revisión: 24 h** (12 h la última semana). Quien revisa puede aprobar, pedir cambios o comentar sin bloquear.
- **Estrategia de merge:**
  - `feat/*` → `develop`: **Rebase and merge**, para conservar los commits pequeños en orden lineal.
  - `develop` → `main`: **Create a merge commit**, para que cada promoción quede marcada.
  - Squash desactivado: aplastaría los micro-hitos.
- **Bypass de emergencia:** solo el administrador, solo si la otra persona no está disponible en los días de congelación, y explicándolo en la PR con `bypass: <motivo>`.

### Cuando algo falla

Las dos maneras que planteabas se reducen a dos casos según el momento:

| Cuándo se detecta                                    | Qué se hace                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Durante la revisión** (la PR aún no está mergeada) | Se arregla en local **en la misma rama** y se hace push: la PR se actualiza sola y se vuelve a revisar. No hace falta una PR nueva                                                                |
| **Ya está en `develop`**                             | Se crea `fix/<issue>-<slug>` **desde `develop`**, PR pequeña, revisión y merge. Una vez mergeado el código ya no se puede "rehacer la PR"; un arreglo en local acaba igualmente en una rama nueva |
| Ya está en `main` (no debería pasar)                 | `fix/*` desde `develop` y se promociona a `main` con una PR `develop → main`                                                                                                                      |

### Promoción `develop` → `main`

En los hitos (fin de semana 1, **1 nov** antes del checkpoint, **8 nov** antes de la entrega) o cuando haya una mejora estable:
1. CI en verde en `develop`.
2. **Smoke test en staging, no solo en local** (es lo que sustituye a "cada uno prueba develop en su entorno"):
   - [ ] La demo A completa en devnet, con su firma en el explorer
   - [ ] La demo B revierte por `GUARD_FAIL` y no por el swap
   - [ ] Pago inválido → 402
   - [ ] Tx caducada → rebuild gratis
3. PR `develop → main` con el checklist marcado y aprobada por la otra persona.
4. Tag: `v0.1.0` (checkpoint), `v1.0.0` (final).

---

## 8. Controles automáticos

Hay tres capas, y cada una cubre lo que la anterior no puede:

| Capa                          | Para qué                                                                 | Se puede saltar                      |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| **Hooks locales** (lefthook)  | Aviso rápido antes de que el error salga del PC                          | Sí (`--no-verify`), por eso no basta |
| **CI** (GitHub Actions)       | La comprobación que nadie puede saltarse, en una máquina limpia          | No                                   |
| **Reglas de rama** (rulesets) | Impiden que algo entre en `develop` o `main` sin CI verde y sin revisión | Solo el admin, en emergencias        |

### Jobs de la CI y por qué existen en xARGOS

| Job                          | Qué hace                                                        | Por qué en este proyecto                                                                                                           | Si no estuviera…                                             |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `secrets` (gitleaks)         | Busca claves en todo el historial                               | El repo es público, hay bots que lo rastrean en minutos, y ya hubo una fuga del token de Telegram en SAVE                          | Una clave del `payer` o del RPC acaba en GitHub y se roba    |
| `lint` (Biome)               | Estilo y errores comunes                                        | Escriben código dos personas y dos Claude Code; sin esto, las PRs se llenan de cambios de formato                                  | Revisiones con ruido en lugar de lógica                      |
| `typecheck`                  | Compila TypeScript en todo el monorepo                          | **El más importante**: si Billy cambia un esquema de `packages/shared`, la PR falla en el front **antes** del merge                | El back y el front se desincronizan y se descubre en la demo |
| `test` (Vitest)              | Tests de `quote`/`minDelta`, flujo de pago y máquina de estados | Son la lógica que decide cuánto recibe el agente y qué ve el jurado                                                                | Un cambio rompe el cálculo del mínimo sin que nadie lo note  |
| `build`                      | `next build` y build del API                                    | `next build` detecta errores que `typecheck` no ve (server/client components, variables de entorno) y es lo mismo que hará Netlify | La preview de Netlify falla después del merge                |
| `program` (Anchor + LiteSVM) | Compila el guard y pasa sus 5 tests                             | El guard es la única pieza on-chain y el núcleo de la promesa "todo o nada". Solo corre si cambia `programs/`, porque es lento     | Una regresión hace que la demo B no demuestre nada           |
| `promote-guard`              | Falla si una PR a `main` no viene de `develop`                  | Hace cumplir vuestra regla de ramas                                                                                                | Alguien mergea una feature directa a producción              |
| `ci-ok`                      | Agrupa a todos los anteriores                                   | Así la regla de rama exige un solo check, y los jobs que se saltan (Anchor sin cambios) no bloquean                                | Habría que mantener a mano la lista de checks obligatorios   |

### Lo que se deja fuera a propósito

| No incluido                             | Motivo                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Tests end-to-end contra devnet en la CI | Devnet y el faucet fallan a ratos: la CI se pondría roja sin culpa vuestra. Se cubre con el smoke test manual de la promoción (§7) |
| Umbral mínimo de cobertura              | En tres semanas es burocracia; se exige test del cambio en la Definition of Done                                                   |
| Dependabot con PRs automáticas          | Ruido en plena entrega. Basta con las alertas de seguridad activadas                                                               |
| Deploy desde Actions                    | Netlify y Railway despliegan solos al hacer push a la rama                                                                         |
| Check de Netlify como obligatorio       | Si se acaban los créditos, bloquearía todas las PRs                                                                                |

### Reglas de rama y para qué sirve cada una

| Regla                                   | Para qué                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Require a pull request                  | Nadie hace push directo: lo que hay en `develop` y `main` siempre ha pasado por revisión |
| 1 approval                              | La revisión cruzada: Billy revisa a Leandro y viceversa                                  |
| Dismiss stale approvals                 | Si se hace push después de aprobar, hay que volver a aprobar; evita colar cambios        |
| Require review from Code Owners         | Asigna al revisor automáticamente                                                        |
| Require conversation resolution         | No se mergea con comentarios pendientes                                                  |
| Required status check `ci-ok`           | No se mergea con la CI en rojo                                                           |
| Block force pushes · Restrict deletions | Nadie reescribe ni borra el historial compartido                                         |
- El objetivo es que la CI tarde **menos de 5 minutos**.
- Archivos listos en `repo-starter/`: `.github/workflows/ci.yml`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `lefthook.yml`, `apps/web/netlify.toml`.

### Configuración de GitHub (una vez, la hace Billy)

1. **Repo público desde el primer día.** El jurado lo necesita, y las reglas de rama son gratis en repos públicos (en privados piden GitHub Pro o Team).
2. Settings → General → Pull Requests: activar **Rebase merging** y **Merge commits**, desactivar **Squash merging**, activar **Automatically delete head branches**.
3. Settings → Rules → **Rulesets** → uno para `develop` y otro para `main`:
   - Require a pull request · **1** approval · Dismiss stale approvals · Require review from Code Owners · Require conversation resolution
   - Require status checks: **`ci-ok`**
   - Block force pushes · Restrict deletions
   - Bypass: solo el administrador (emergencias, §7)
4. Rama por defecto: `develop`, para que las PRs apunten ahí sin pensarlo.
5. Activar **Secret scanning** y **Push protection** (Settings → Code security).

---

## 9. Metodología: Kanban ligero

- **GitHub Projects** con cuatro columnas: `Todo · In progress · In review · Done`.
- **Una issue = una tarea de un día como máximo = una PR.** Rama `feat/<n>-slug`, y la PR lleva `Closes #n`.
- **Daily asíncrona** en el chat del proyecto, tres líneas: ayer · hoy · bloqueos.
- **Dos syncs de 20 min por semana** (martes y viernes): estado, cambios de contrato y próxima promoción.
- **Definition of Done:** CI verde · tests del cambio · sin secretos · contrato respetado · aprobada por el otro · probada en staging si toca devnet.
- **ADRs cortas** en `docs/adr/`: una página por cada decisión que cueste deshacer (facilitador x402, ALT, cambio de contrato).

---

## 10. Entornos y configuración

| Entorno    | Rama       | Back            | Front                                 | Red    |
| ---------- | ---------- | --------------- | ------------------------------------- | ------ |
| local      | cualquiera | `pnpm dev`      | `pnpm dev` (mock por defecto)         | devnet |
| staging    | `develop`  | Railway staging | Branch deploy de `develop` en Netlify | devnet |
| producción | `main`     | Railway prod    | Netlify prod                          | devnet |
- `.env.example` commiteado con todas las variables y valores vacíos o `***`.
- El back valida su configuración con Zod al arrancar y no arranca si falta algo.
- Secretos solo en `.env` local y en el panel de Railway o Netlify. Staging y producción usan claves distintas.

### Netlify: tres límites que condicionan el diseño

1. **Tiempo de las funciones.** El proxy de Next (`app/api/xargos/*`) corre como función de Netlify. Hay casos de cortes a los ~10 s con Next.js, y el máximo documentado son 30 s. **Regla: cada endpoint del backend responde en menos de 8 s.** Lo que tarde más (esperar confirmaciones, `/demo/setup` completo, `/demo/price-shock`) responde **202 con un id**, y el front consulta el estado con polling. Este cambio entra en la PR #1 del contrato.
2. **Créditos del plan gratis.** Hay 300 créditos al mes y **cada deploy de producción gasta 15**: unos 20 deploys. Las deploy previews son ilimitadas. Por eso producción = solo `main`, que se promociona pocas veces (§7). Revisad el panel de uso cada semana y **no promocionéis a `main` por cualquier cosa la última semana**: si os quedáis sin créditos, no sabemos si el sitio sigue publicado.
3. **No construir si no cambia el front.** `apps/web/netlify.toml` incluye un `ignore` que salta el build si el commit no toca `apps/web`, `packages/shared` ni el lockfile. Así una PR solo de backend no gasta build.

- Configuración en Netlify (la hace Leandro): monorepo con _package directory_ `apps/web` · production branch `main` · branch deploys solo para `develop` · deploy previews activadas · variables de entorno separadas para producción y para `develop`/previews.
- Wallets del back: `payer` (fondea agentes, paga la PDA y los shocks; con alerta de saldo bajo) y `payTo` (recibe los pagos x402; basta con la pública).
- `/demo/setup` con rate limit por IP y por agente, tope por llamada y `DEMO_ACCESS_CODE`.

---

## 11. Plan por semanas

| Fechas                  | Billy (back + programa)                                                                   | Leandro (front)                                                              | Los dos                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **sáb 17 – dom 18 oct** | Crear repo, CI, rulesets, lefthook                                                        | `create-solana-dapp` dentro de `apps/web`, Tailwind y shadcn                 | **PR #1: contrato v0 en `packages/shared`** (incluye el keypair generado en el navegador) |
| **19 – 21 oct**         | **Spike x402 en devnet** (¿cobra solo con 2xx?) · pool Orca propio                        | Cliente API + MSW con fixtures · máquina de estados                          | Sync del martes                                                                           |
| **22 – 25 oct**         | **Programa guard** + LiteSVM + deploy · cliente Codama                                    | Pantallas de la demo A y B en mock · tabla de errores                        | **Primera promoción a `main`**                                                            |
| **26 – 28 oct**         | `POST /recipes/:id/build` **sin x402**, real en devnet (demo A) · `/demo/setup`           | Conectar a staging · firma con Kit · proxy BFF                               | —                                                                                         |
| **29 – 31 oct**         | **x402 integrado, probado a través del proxy en Netlify** · `/demo/price-shock` calibrado | Pago con `@x402/fetch` desde el navegador · pantallas de caducidad y rebuild | Smoke test en staging                                                                     |
| **dom 1 nov**           | README de arquitectura                                                                    | README del front                                                             | **Promoción `v0.1.0`**                                                                    |
| **lun 2 nov**           |                                                                                           |                                                                              | **Checkpoint intermedio:** demo A real + demo B como mínimo en mock                       |
| **2 – 6 nov**           | Demo B real y estable · rebuild gratis · pagos fallidos                                   | Pulido de UX y mensajes · guion del vídeo                                    | Syncs martes y viernes                                                                    |
| **sáb 7 nov**           | Solo arreglos (feature freeze)                                                            | Solo arreglos                                                                | —                                                                                         |
| **dom 8 nov**           |                                                                                           |                                                                              | **Code freeze · promoción `v1.0.0` · grabar vídeo**                                       |
| **lun 9 nov**           |                                                                                           |                                                                              | **Entrega final**                                                                         |

---

## 12. Riesgos y plan B

| Riesgo                                               | Plan B                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| El facilitador no soporta devnet                     | Autofacilitar: verificar y enviar el pago desde el backend                    |
| No se puede crear un pool de Orca con USDC de Circle | Pool con un mint propio de "USDC demo"; el pago x402 sigue en USDC de Circle  |
| La tx no cabe ni con ALT                             | Las ATAs van en una tx previa; la receta sigue siendo atómica                 |
| El faucet de USDC da poco                            | Importes pequeños (~10 USDC por agente), reutilizar agentes, código de acceso |
| Una persona no puede revisar                         | Plazo de 24 h; bypass de emergencia solo en los días de congelación           |
| Devnet caído el día de grabar                        | El modo mock como respaldo; grabar la demo real en cuanto esté estable        |

---

## 13. Reglas para los ejecutores (Claude Code de cada uno)

1. Leer este brief entero antes de empezar y respetar §0 sin excepción.
2. Trabajar siempre en una rama `feat/`, `fix/` o `chore/` creada desde `develop` actualizado. **Nunca hacer push a `develop` ni a `main`.**
3. **Commit en cada micro-hito** (compila y su test pasa), en formato Conventional Commits y de 72 caracteres como máximo. Nunca un commit con varios cambios sin relación.
4. Antes de abrir la PR: `pnpm lint && pnpm typecheck && pnpm test` en verde.
5. Abrir la PR contra `develop` con `gh pr create`, rellenando la plantilla. Si pasa de unas 400 líneas, proponer cómo dividirla.
6. **No tocar `packages/shared` dentro de una PR de feature.** Si el contrato necesita cambiar, proponerlo en una PR aparte.
7. Ningún secreto en archivos, logs ni descripciones de PR.
8. Verificar las APIs en el código instalado antes de usarlas, y citar el archivo `.d.ts` o la doc cuando sea relevante.

### Primer prompt — Claude Code de Billy

> Lee `docs/xargos-execution-brief.md` entero y respeta §0 y §13. Tarea: spike de x402 en devnet (§11, 19–21 oct) en la rama `feat/<issue>-x402-spike`. Un endpoint de juguete en Hono que cobre 0.01 USDC de Circle en devnet con `@x402/core` y `@x402/svm`, verificados en la versión instalada. Antes de escribir código, dime qué paquetes, qué versión y qué facilitador vas a usar, y por qué. Implementa el flujo explícito verify → trabajo → settle. Haz commit en cada micro-hito. Al terminar, dame la firma de la liquidación en el explorer, responde si el middleware oficial liquida solo con respuestas 2xx, y abre la PR contra `develop`.

### Primer prompt — Claude Code de Leandro

> Lee `docs/xargos-execution-brief.md` entero y respeta §0 y §13. Tarea: base del frontend en la rama `feat/<issue>-web-scaffold`. Integra `create-solana-dapp` dentro de `apps/web` del monorepo pnpm (Next.js App Router, `@solana/kit`, Tailwind, shadcn/ui), con el interruptor `NEXT_PUBLIC_API_MODE` (mock por defecto, usando MSW y las fixtures de `packages/shared`), el cliente único `lib/api` que parsea con Zod, y la máquina de estados de la demo del §6 como unión discriminada con `useReducer` y sus tests en Vitest. No toques `packages/shared`: si te falta algo del contrato, dímelo y lo proponemos en una PR aparte. Haz commit en cada micro-hito y abre la PR contra `develop`.
