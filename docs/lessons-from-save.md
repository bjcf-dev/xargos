# Lecciones aprendidas en otro proyecto (SAVE)

SAVE es un proyecto privado de Billy en Solana (Anchor + TypeScript) que opera con fondos reales. **Aquí solo hay conocimiento**: ni código, ni direcciones, ni configuración. Cada lección dice qué pasó y qué hacer en xARGOS.

## Programa Anchor

1. **Las semillas de una PDA salen del estado guardado, no de quien firma.**
   Pasó: se usaba `authority.key()` (la cuenta pasada en la llamada) en vez del valor guardado en la cuenta; cuando firmaba otra clave, la PDA se recalculaba mal.
   En xARGOS: la PDA del snapshot es `["snap", agent, mint]`. `agent` debe ser el dueño **comprobado** de la cuenta de token, no cualquier cuenta que llegue en la instrucción.

2. **`cargo test` no recompila el programa.** Los tests (LiteSVM) cargan el `.so` compilado.
   En xARGOS: `anchor build` antes de `cargo test` (también regenera el IDL, del que sale el cliente Codama). La CI ya lo hace en ese orden.

3. **Las restricciones de acceso se revisan de una en una.** Una restricción (`has_one`) bloqueaba un caso válido por su cuenta, aparte del bug de las semillas.
   En xARGOS: un test por cada restricción del guard (owner, mint, slot, delta).

4. **Crates pesados → avisos de pila en SBPF.** El crate cliente de Orca, como dependencia del programa, traía estructuras grandes (TickArray) que generaban avisos de marco de pila al enlazar para SBF, con riesgo de desbordar la pila en ejecución, y además inflaban el binario. Se sacó el crate del programa (quedó solo para los tests) y se escribieron los encoders a mano, con tests de equivalencia contra el builder oficial. Esos avisos **solo aparecen al compilar para SBF**: un `cargo build` normal (para el host) no los muestra ni genera el `.so`.
   En xARGOS: el guard **no** hace CPI a Orca ni importa sus crates. Solo lee cuentas de token. Programa mínimo. Para comprobar avisos, compilar siempre con `anchor build`.

5. **Nada de valores "0 provisional" en importes.** Un importe se dejó a 0 en una CPI y pasó desapercibido.
   En xARGOS: `require!(min_delta > 0)` y tests que rechacen el cero.

6. **Unidades y decimales separados.** Un importe en unidades base de USDC (6 decimales) se pasó a una función que esperaba lamports (9 decimales), y el resultado salió unas 10 veces menor de lo debido sin dar ningún error. En otro caso, un importe calculado en unidades de un token se usó como si estuviera en las de otro.
   En xARGOS: importes siempre en **unidades base** (`u64` on-chain, `string`/`bigint` en JS), un campo por mint con la unidad en el nombre y sin conversiones implícitas. Cada conversión, explícita y con test.

## Off-chain (TypeScript)

7. **Derivar PDAs desde una pubkey configurada, no desde la wallet cargada.** Al cambiar de clave, la dirección salía mal sin avisar.
   En xARGOS: las direcciones fijas (program ID del guard, pool, mints) vienen de la configuración validada, nunca de "la clave que esté cargada".

8. **Sin caídas silenciosas a valores por defecto.** El servicio arrancaba aunque la configuración estuviera mal, y algunas funciones se apagaban dejando solo una línea de aviso en el log. Pasó varias veces:
   - el gestor de servicios (systemd, con `EnvironmentFile`) **no quita los comentarios al final de la línea**, así que el comentario quedaba dentro del valor y una dirección pasaba a ser inválida;
   - una variable seguía apuntando a otro cluster después de migrar;
   - otra estaba definida con un nombre que el código no leía.
     En xARGOS: configuración validada con Zod al arrancar (formato de direcciones y cluster incluidos); si algo falta o no es válido, no arranca. En los `.env`, nada de comentarios al final de una línea.

9. **Las comisiones de un protocolo se leen de la cadena, no se escriben a mano.** Se supuso una comisión 10 veces mayor que la real.
   En xARGOS: la comisión del pool de Orca sale de la cuenta del Whirlpool al calcular `quote` y `minDelta`.

10. **Guardar el valor en el momento de decidir.** Un dato se calculaba después de esperar la confirmación y ya no era el que motivó la decisión.
    En xARGOS: `expectedOut` y `minDelta` se fijan al construir la receta y se guardan con el `buildId`.

11. **No mezclar librerías de Solana.** `@solana/compat` (v8) solo convierte **de web3.js v1 a Kit** (PublicKey, Keypair, TransactionInstruction y VersionedTransaction). La dirección contraria no existe: para meter instrucciones de un SDK basado en Kit en una transacción de web3.js v1 hubo que escribir y mantener un adaptador propio.
    En xARGOS: solo `@solana/kit`, sin conversiones.

12. **Encoders de instrucciones hechos a mano = verificación byte a byte.** Funcionó, pero costó mucho.
    En xARGOS: usar el SDK de Orca con Kit y Codama para el guard; nada a mano.

## Solana en general

13. **`getTransaction` necesita `maxSupportedTransactionVersion`**, o no devuelve las transacciones versionadas. Mainnet ya tiene **transacciones versión 1**: con `maxSupportedTransactionVersion: 0` la llamada falla, y `@solana/web3.js` 1.98 ni siquiera sabe decodificarlas. Para leer transacciones de otros, pedir con la versión más alta que soporte el cliente y tratar "versión no soportada" como un caso esperado, no como un fallo.
14. **El blockhash caduca en ~150 bloques (~1 minuto).** De ahí que la tx se reconstruya con un blockhash nuevo; el rebuild gratis de 120 s es la ventana del `buildId`, no la vida del blockhash.
15. **Simular antes de enviar** (`simulateTransaction`): detecta errores sin gastar comisión. En SAVE, la simulación previa al envío rechazó sin coste operaciones que no cumplían su condición, y simular la transacción completa sirvió para confirmar que estaba bien formada (fallaba exactamente en la comprobación esperada, no antes).
16. **Tamaño máximo de tx: 1232 bytes.** Muchas cuentas → ALT. Una ALT admite como máximo 256 direcciones, y las que se añaden no se pueden usar hasta el slot siguiente.
17. **Solana CLI se instala desde `release.anza.xyz`.** El dominio antiguo de solana.com ya no funciona. (Conocimiento general, no algo documentado en SAVE.)
18. **Orca:** quien tiene el token (NFT) de la posición la controla; en SAVE, la cuenta que firma como autoridad de la posición tiene que ser la que lo posee. Un swap necesita los tick arrays correctos en la dirección del precio, y **solo puede recorrer los que se le pasan** (hasta 3 por swap); si el precio tiene que moverse más allá, falla. En un pool propio, inicializad los tick arrays que cubra el price shock o el swap fallará. Además, un pool sin actividad puede mostrar un precio que en realidad no se puede operar: cotizad siempre con el SDK antes de fiaros del precio.
19. **wSOL:** hay que crear y cerrar la cuenta temporal (o usar las opciones del SDK) para no dejar SOL envuelto. (Conocimiento general: SAVE no envolvía SOL.)

## Seguridad y forma de trabajar

20. **Los secretos se filtraron por la salida de comandos, no por archivos.**
    - Al generar claves de prueba desde la terminal de un agente, la frase semilla salió por la salida estándar, que es el propio chat; se dieron por quemadas.
    - Una URL de RPC con la API key incrustada se imprimía en los logs de los scripts y del servicio, hasta que se añadió una función que deja solo el dominio.
    - Los errores de red también pueden traer la URL completa, y con ella la clave o el token del bot.
      En xARGOS: claves generadas fuera de cualquier agente; ninguna URL con credenciales en logs ni en mensajes de error (redactar antes de imprimir); gitleaks en los hooks y en la CI para que tampoco lleguen a un archivo commiteado.
21. **Las direcciones públicas no son secretos** (program ID, PDAs, pubkeys), pero en este repo solo aparecen las de **devnet de xARGOS**.
22. **Evidencia literal, no narración.** Las afirmaciones del tipo "funciona" se acompañan de la salida de los tests o de la firma en el explorer.
23. **Instrucciones quirúrgicas:** cada tarea con sus pasos, comandos exactos y criterio de "hecho". Si un paso choca con la realidad, se para y se pregunta.
