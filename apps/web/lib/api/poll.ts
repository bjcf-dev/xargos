import { ApiClientError } from "./errors";

export type PollOptions = {
  /** Contrato: polling cada ~1,5 s. */
  intervalMs?: number;
  timeoutMs?: number;
  /** Para cancelar al desmontar el componente. */
  signal?: AbortSignal;
};

/** Espera cancelable: rechaza con signal.reason en cuanto se aborta. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Si ya se canceló (p. ej. durante la consulta anterior), el evento no volverá a llegar.
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Llama a `fn` hasta que `isDone` acepte el resultado (endpoints 202 del contrato). */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  isDone: (value: T) => boolean,
  { intervalMs = 1_500, timeoutMs = 120_000, signal }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const value = await fn();
    if (isDone(value)) return value;
    if (Date.now() + intervalMs > deadline) {
      throw new ApiClientError("INTERNAL", "Polling timed out", { details: { timeoutMs } });
    }
    await sleep(intervalMs, signal);
  }
}
