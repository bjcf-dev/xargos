# xARGOS — contexto para Claude Code

Lee este archivo entero al empezar cualquier sesión. Es el puente entre las conversaciones de diseño (en claude.ai) y el trabajo en el repo: aquí está todo lo que se decidió y por qué.

## Qué es

**Recetas DeFi de varios pasos para agentes de IA, pagadas por petición con x402 en Solana, que o salen como se prometió o no se ejecutan.**
- El agente pide una receta (p. ej. "sal de mi posición LP de Orca y déjamelo todo en USDC") y paga un pequeño importe en USDC con x402.
- Recibe una transacción v0 completa, lista para firmar, que empieza con `snapshot` y termina con `assert_min_delta` de nuestro programa **guard**: si el agente recibe menos de `minDelta` USDC, Solana revierte la transacción entera.
- No custodiamos fondos ni firmamos por el agente. La garantía la impone la cadena.

Hackathon: Encode Solana Hackathon 2026, reto **Best Use of x402 on Solana**. Entrega intermedia **lun 2 nov 12:59 (Madrid)**, final **lun 9 nov 12:59**. Detalles en `docs/hackathon.md`.

Equipo: **Billy** (backend `services/api` + programa `programs/guard` + `scripts/`) y **Leandro** (frontend `apps/web`). `packages/shared` es de los dos.

## Reglas que no se rompen

1. **Solo devnet.** Ningún RPC, mint, program ID ni clave de mainnet.
2. **Cero secretos en archivos commiteados**, incluidos `.md`, logs y descripciones de PR. Claves privadas, API keys y URLs de RPC con `api-key` se escriben como `***` o "ver `.env`".
3. **Nada de SAVE en este repo.** SAVE es un proyecto privado de Billy que opera en mainnet. De él se reutiliza **conocimiento** (`docs/lessons-from-save.md`), nunca archivos, direcciones ni configuración. No intentes leer carpetas fuera de este repo.
4. **No usar nunca la config global de Solana** (`solana config`). Siempre `--url devnet --keypair <ruta de xARGOS>` o lo que diga `Anchor.toml`. Las claves de xARGOS viven en `~/.config/xargos/` y no se leen ni se imprimen.
5. **Nunca push a `develop` ni a `main`.** Rama `<tipo>/<issue>-<area>-<descripcion>` (p. ej. `feat/14-guard-snapshot-assert`) desde `develop`, y PR contra `develop`. Flujo completo en `CONTRIBUTING.md`.
6. **Commit en cada micro-hito** (compila y su test pasa), formato `tipo(scope): descripción` de ≤72 caracteres. Tipos: feat fix refactor test docs chore ci build perf. Scopes: api web guard shared scripts repo.
7. **PRs pequeñas** (menos de ~400 líneas sin lockfile). Antes de abrirla: `pnpm lint && pnpm typecheck && pnpm test`.
8. **No tocar `packages/shared` dentro de una PR de feature.** Los cambios de contrato van en su propia PR.
9. **Verificar antes de usar.** Nombres de paquetes, firmas y cuentas se comprueban en el `.d.ts` instalado o en la doc oficial. Si no puedes verificar algo, dilo en vez de suponerlo.
10. **Pruebas reales, no narradas.** Un hito de devnet se demuestra con la firma de la transacción (enlace al explorer con `?cluster=devnet`) y la salida literal de los comandos.
11. **Código de fuera = declarado.** Si añades una dependencia, un scaffold o código anterior al 12 oct, actualiza "Prior work & third-party code" del README en la misma PR.

## Dónde está cada cosa

| Necesito…                                       | Leer                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Por qué se eligió cada cosa (y qué se descartó) | `docs/decisions.md`                                                                                                                              |
| Stack, arquitectura, Git, CI, plan por semanas  | `docs/xargos-execution-brief.md`                                                                                                                 |
| Endpoints, tipos y errores entre front y back   | `docs/api-contract.md`                                                                                                                           |
| Trampas ya conocidas de Solana/Anchor/Orca      | `docs/lessons-from-save.md`                                                                                                                      |
| Reglas, fechas y criterios del hackathon        | `docs/hackathon.md`                                                                                                                              |
| Contexto específico de mi parte                 | `CLAUDE.md` dentro de `apps/web`, `services/api` o `programs/guard`                                                                              |
| Flujo de ramas, commits, PR y revisión          | `CONTRIBUTING.md`                                                                                                                                |
| Mi plan de hitos y tareas (solo local)          | `local/BRIEF-backend.md` o `local/BRIEF-frontend.md`, si existe. **Nunca se sube**: `local/` está en `.gitignore`; no lo añadas con `git add -f` |

## Stack (resumen)

pnpm workspaces · Node 22 · TypeScript strict · **`@solana/kit`** (no web3.js v1) · Zod en `packages/shared` · Biome · Vitest · Anchor 1.0.x + LiteSVM · Codama · x402 oficial (`@x402/core`, `@x402/svm`, `@x402/fetch`) · Hono · Next.js App Router · Netlify (front) · Railway (back).

## Cómo trabajar conmigo (preferencias de Billy)

- Instrucciones y respuestas concretas, sin rodeos; si algo no está claro o choca con la realidad, dilo.
- Antes de escribir código para algo nuevo: di qué vas a usar y por qué, en pocas líneas.
- Al terminar una tarea: qué cambió, cómo se prueba, y la evidencia (salida de tests, firma en devnet).
- No repitas avisos de cosas ya confirmadas.
