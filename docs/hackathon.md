# Encode Solana Hackathon 2026

- **Organiza:** Encode Club x Solana Foundation. Online, empezó el 12 oct 2026. 86 proyectos.
- **Nuestro proyecto:** xARGOS · reto **Best Use of x402 on Solana**. Programme Manager: Giles Mallinson (Encode).
- **Premio:** plazas en el acelerador de 8 semanas de Encode. **No hay premio en metálico.**

## Fechas (hora de Madrid)

| Fecha               | Qué                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| lun 19 oct 13:59    | Crear proyecto y equipo ✅                                                                                                                                   |
| **lun 2 nov 12:59** | **Entrega intermedia (obligatoria).** Campos: Description, Code, Demo Video, Live Demo, Slides. Se acepta trabajo a medias. Plan: entregar el **dom 1 nov**. |
| lun 2 nov 13:59     | Último momento para añadir miembros al equipo (máx. 5)                                                                                                       |
| **lun 9 nov 12:59** | **Entrega final.** Plan: code freeze el dom 8 nov                                                                                                            |
| lun 16 nov          | Ganadores                                                                                                                                                    |

## Criterios del reto x402

1. Integración con sentido de x402 **y** de Solana.
2. Fiabilidad del flujo pago → acceso.
3. Un caso de uso convincente, más allá de una integración básica.
4. **Documentación clara y manejo sensato de los pagos fallidos.**

La demo tiene que enseñar el flujo completo: petición de pago (402), verificación o liquidación en Solana y entrega del recurso.

## Reto secundario: Aurora Intents

"Bring any-chain liquidity to Solana". Premios: 1.500 $, 1.000 $ y 500 $, más el paquete de apoyo de Aurora. Aurora confirmó el 5 nov que nos tiene registrados.

Criterios (página del reto en Encode):

1. Una integración que funciona de verdad de al menos un producto (Intents Connect, Swap API o Intents Deposits), enseñada en vivo. **Flujo real, no simulado.**
2. Que quite una fricción real entre cadenas y resuelva un problema creíble del usuario.
3. Calidad técnica: liquidaciones y reembolsos bien gestionados, y una experiencia sencilla que esconda la complejidad.
4. Encaje y creatividad en la categoría elegida.
5. Bonus: varias cadenas de origen, composición con contratos (Intents Connect) o Confidential Intents.

Lo nuestro: Swap API, de Base, Arbitrum o Ethereum a USDC en Solana, para fondear al agente que paga recetas con x402 ([D31](decisions.md)).


- Demo funcionando (devnet basta).
- Repo con README e instrucciones de instalación.
- Vídeo de 2–4 minutos.
- Explicación clara de cómo Solana hace posible el proyecto.

## Código previo

Confirmado por Giles (20 oct): librerías open source, scaffolds y utilidades propias anteriores están permitidas **si se declaran en el README** ("Prior work & third-party code").

## Recursos oficiales

Solana docs · Solana Cookbook · Anchor docs · Solana Kit (`anza-xyz/kit`) · create-solana-dapp · Wallet Adapter · faucet.solana.com · explorer.solana.com (devnet) · Helius docs · Solana Agent Kit · Solana Stack Exchange · Discord de Encode.
