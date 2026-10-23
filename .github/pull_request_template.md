## Qué

<!-- Una o dos frases. -->

Closes #

## Por qué

<!-- Qué problema resuelve o qué hito del brief cubre. -->

## Cómo probarlo

<!-- Pasos concretos. Si toca devnet: firma o enlace del explorer. -->

## Capturas

<!-- Solo si cambia la UI. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` en verde en local
- [ ] Tests añadidos o actualizados para este cambio
- [ ] Sin secretos en código, docs, logs ni en esta descripción
- [ ] No toca `packages/shared` (o es una PR solo de contrato)
- [ ] Si añade una dependencia, un scaffold o código anterior al 12 oct: añadido a "Prior work & third-party code" del README
- [ ] PR pequeña (menos de ~400 líneas sin lockfile) o justificado por qué no
- [ ] Probado en devnet, si aplica

<!-- Solo para develop → main -->
### Promoción a main

- [ ] Demo A completa en staging (firma: )
- [ ] Demo B revierte por GUARD_FAIL y no por el swap
- [ ] Pago inválido → 402
- [ ] Tx caducada → rebuild gratis
