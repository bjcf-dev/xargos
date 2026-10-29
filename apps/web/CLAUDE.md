# apps/web — contexto del frontend (Leandro)

Complementa al `CLAUDE.md` de la raíz. Arquitectura completa: `docs/xargos-execution-brief.md` §6. Contrato: `docs/api-contract.md`.

## Qué tiene que conseguir

Que un juez pruebe xARGOS **sin wallet ni faucet** y entienda en segundos la garantía "todo o nada":
- **Demo A:** el agente paga con x402, firma y recibe lo prometido.
- **Demo B:** tras un price shock, la tx revierte por el guard. La UI enseña qué paso falló y que la posición sigue intacta.
- Una explicación clara de los pagos fallidos (es un criterio del jurado).

## Estructura

```
app/                        # rutas: /, /demo, /recipes
app/api/xargos/[...path]/   # proxy al backend (añade DEMO_ACCESS_CODE, reenvía cabeceras x402)
features/demo/              # máquina de estados, componentes, hooks
lib/api/                    # ÚNICO cliente HTTP; parsea con los esquemas de packages/shared
lib/solana/                 # Kit: keypair del agente, firmar, enviar, explorer
mocks/                      # MSW con las fixtures de packages/shared
components/ui/              # shadcn
```

## Reglas propias

- **El navegador solo llama a `/api/xargos/*`.** Ninguna clave ni URL privada en código de cliente ni en variables `NEXT_PUBLIC_*`.
- **Ningún `fetch` directo en componentes**: todo pasa por `lib/api`.
- **Máquina de estados de la demo** como unión discriminada con `useReducer`: `idle → setup → paying → built → signing → confirmed | reverted | expired → rebuilding`, con tests en Vitest.
- **Agente generado en el navegador:** `CryptoKey` Ed25519 no extraíble en IndexedDB (`AgentKeyStore`, `lib/solana`), 24 h y botón _New agent_. Si no se puede guardar, solo en memoria, nunca la semilla. Al backend solo va la pública (D13, D30).
- **Ninguna cifra escrita a mano:** todo sale de `quote` y `guard`.
- **Solo decir "guard" si falló el guard:** leer `meta.err` y el log `GUARD_FAIL` (D15).
- `/demo/setup` y `/demo/price-shock` son asíncronos: progreso por fases con polling, y mensajes claros para `RATE_LIMITED` y `ACCESS_DENIED`.
- `NEXT_PUBLIC_API_MODE=mock | local | staging`; por defecto `mock`, que funciona sin backend ni secretos.

## Netlify

Producción = solo `main` (cada deploy gasta créditos). `netlify.toml` salta el build si no cambia el front. Las funciones se cortan a ~10 s: no hacer esperas largas en el proxy. `NEXT_PUBLIC_API_MODE` se pone en el panel de Netlify **antes** del build: se sustituye al construir y, fuera de `mock`, el build sale sin MSW (#42).

`SOLANA_RPC_URL` (solo servidor, nunca `NEXT_PUBLIC_*`): RPC de devnet al que reenvía `/api/xargos/rpc`. Sin ella, el devnet público. La ruta comprueba el genesis de devnet y solo deja pasar `getLatestBlockhash`, `simulateTransaction`, `sendTransaction`, `getSignatureStatuses` y `getTransaction`. Límite en memoria de 120 peticiones por minuto por cliente (`x-nf-client-connection-ip`) y 600 en total por instancia; el de la plataforma es un `[[redirects]]` con `rate_limit` en `netlify.toml` (120/min por IP), por comprobar al desplegar (D30). Reenvía la petición ya comprobada, reconstruida, nunca el texto original. **No mira `Origin` a propósito**: cualquiera con `curl` puede mandar `sendTransaction` con nuestra clave de Helius, frenado solo por el límite de peticiones. En devnet lo aceptamos, porque `Origin` lo falsifica cualquiera fuera del navegador. Sin `x-nf-client-connection-ip`, todas las peticiones comparten un cubo; en F7, comprobar que Netlify sobrescribe esa cabecera si la manda el cliente.

CSP estricta con nonce en `proxy.ts` (`lib/server/csp.ts`): scripts solo con el nonce de la petición, así que todas las páginas se renderizan en dinámico. Un script de terceros necesita su origen en la CSP y el nonce (`x-nonce`).
