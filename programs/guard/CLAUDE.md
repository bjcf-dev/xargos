# programs/guard — contexto del programa (Billy)

Complementa al `CLAUDE.md` de la raíz. Decisiones: `docs/decisions.md` D5–D8. Trampas: `docs/lessons-from-save.md` 1–6.

## Qué hace

Dos instrucciones, nada más. Sin custodia: solo lee saldos.
- **`snapshot(agent_token_account)`**, primera instrucción de la receta: guarda `amount` y `slot` en la PDA `["snap", agent, mint]`.
- **`assert_min_delta(min_delta: u64)`**, última: exige `snapshot.slot == slot actual`, calcula `received = saldo_actual − snapshot.amount` y, si `received < min_delta`, hace `msg!("GUARD_FAIL received={} min={}", received, min_delta)` y devuelve `MinDeltaNotMet`.
- Una instrucción de inicialización de la PDA, que llama el backend en `/demo/setup`.

## Comprobaciones obligatorias

- `token_account.owner == agent` y `token_account.mint == mint`.
- `min_delta > 0`.
- Aritmética con `saturating_sub` (si el saldo baja, `received` = 0 y falla el assert, sin panic).
- La cuenta de tokens de `snapshot` y de `assert_min_delta` debe ser la **ATA** de `(snapshot.agent, snapshot.mint)`. Sin eso, el agente podría hacer el snapshot sobre una cuenta vacía y el assert sobre otra con saldo.

## Tests (LiteSVM)

Delta suficiente pasa · delta insuficiente falla con `MinDeltaNotMet` y el log `GUARD_FAIL` · snapshot de otro slot falla · cuenta de otro owner falla · mint distinto falla · `min_delta = 0` falla · una segunda cuenta de tokens del agente (no ATA) falla en `snapshot` y en `assert_min_delta`.

## Build y despliegue

- `anchor build` **antes** de `cargo test` (los tests cargan el `.so`; también regenera el IDL para Codama).
- Despliegue solo con `Anchor.toml` (`cluster = "devnet"`, `wallet` en `~/.config/xargos/`). Nunca con la config global de Solana.
- **Upgrade authority: `~/.config/xargos/deployer-keypair.json`** (`2LG4z3q6FxfCcBrJEnG6NwUa5U2wcRo5EwUnsRpkbZ2X`, desde el 1 nov; D32). Vive solo en el ordenador de Billy, nunca en un servidor. `Anchor.toml` la usa como `wallet`: para actualizar el programa, esa clave necesita SOL de devnet (el buffer del `.so` cuesta ~1–2 SOL y se recupera al cerrar).
- La clave `facilitator` vive en el servidor (Render): paga las comisiones de x402, fondea a los agentes y paga la PDA del snapshot (D8). No tiene ninguna autoridad sobre el guard. Ninguna de las dos se lee ni se imprime.
- La clave del program ID se genera en `target/deploy/guard-keypair.json` (ignorada por git): copiarla a `~/.config/xargos/` antes de limpiar `target/`.
- No importar crates de Orca ni hacer CPI a otros programas.
