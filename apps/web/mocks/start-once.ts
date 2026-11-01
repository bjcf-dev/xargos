/**
 * Envuelve un arranque para que varias llamadas compartan la misma promesa.
 * En dev, React Strict Mode ejecuta cada efecto dos veces, y MSW 3 rechaza un
 * segundo worker.start() ("cannot configure an already enabled network").
 * Si el arranque falla, la siguiente llamada lo reintenta.
 */
export function startOnce(start: () => Promise<unknown>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= start().then(
      () => undefined,
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
}
