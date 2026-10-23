# services/api — contexto del backend (Billy)

Complementa al `CLAUDE.md` de la raíz. Arquitectura completa: `docs/xargos-execution-brief.md` §5.

## Responsabilidad

Servicio Hono que vende recetas por x402 y sirve los endpoints de demo del contrato (`docs/api-contract.md`).

## Estructura

```
src/
  index.ts      # arranque; config validada con Zod (no arranca si falta algo)
  routes/       # finas: validan con packages/shared y delegan
  payment/      # verify → build → simulate → settle (D17)
  recipes/      # interfaz Recipe { id, quote, build }; una carpeta por receta
  quote/        # funciones puras (expectedOut, minDelta), testeables sin red
  solana/       # rpc Kit, cliente Codama del guard, ALT, envío/confirmación
  demo/         # setup por fases y price shock (asíncronos, 202 + estado)
  store/        # buildStore con caducidad (rebuild 120 s) y estado de jobs
```

## Reglas propias

- **Nunca firmar la tx del agente.** El backend solo firma con el `payer` (fondeo de la demo, PDA del snapshot, price shock).
- **No liquidar el pago** hasta que el build y la simulación salgan bien.
- **Responder en < 8 s.** Si una operación espera confirmaciones, va como job asíncrono.
- **Logs con pino**, con `buildId` en cada línea, y sin claves, URLs de RPC con `api-key` ni el `DEMO_ACCESS_CODE`.
- `minDelta` y `expectedOut` se fijan al construir y se guardan con el `buildId` (lección 10).
- La comisión del pool se lee de la cuenta del Whirlpool (lección 9).
- Variables de entorno: solo las de `.env.example`. Para leer claves, rutas desde la config; nunca imprimirlas.

## Pendiente de decidir en el spike de x402

- Facilitador: CDP primero, autofacilitar como plan B (D18).
- Confirmar si el middleware oficial liquida solo con respuesta 2xx.
- Que la URL del recurso coincida con la pública del proxy (D20).
