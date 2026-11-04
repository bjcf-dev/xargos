import type { Deposit } from "./types";

/** La dirección de depósito y sus plazos no son secretos: van en localStorage para recargar. */
export const FUND_STORAGE_KEY = "xargos:fund:deposit";

export type DepositStore = {
  load(): Deposit | undefined;
  save(deposit: Deposit): void;
  clear(): void;
};

/** Lo justo para no seguir una dirección que no es: lo demás lo comprueba Aurora al consultar. */
function isDeposit(value: unknown): value is Deposit {
  if (typeof value !== "object" || value === null) return false;
  const { depositAddress, quote } = value as Record<string, unknown>;
  return (
    typeof depositAddress === "string" &&
    depositAddress.length > 0 &&
    typeof quote === "object" &&
    quote !== null
  );
}

/**
 * Guarda el depósito que se sigue. Nunca lanza: en una ventana privada, con los datos del sitio
 * bloqueados o en el servidor, `/fund` funciona igual, solo que sin recuperación al recargar.
 */
export function createDepositStore(
  storage: () => Storage | undefined = () =>
    typeof window === "undefined" ? undefined : window.localStorage,
): DepositStore {
  return {
    load() {
      try {
        const raw = storage()?.getItem(FUND_STORAGE_KEY);
        if (!raw) return undefined;
        const value: unknown = JSON.parse(raw);
        return isDeposit(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },
    save(deposit) {
      try {
        storage()?.setItem(FUND_STORAGE_KEY, JSON.stringify(deposit));
      } catch {
        // Sin almacenamiento no hay recuperación al recargar; el seguimiento sigue en memoria.
      }
    },
    clear() {
      try {
        storage()?.removeItem(FUND_STORAGE_KEY);
      } catch {
        // Ídem: nada que limpiar si no se pudo guardar.
      }
    },
  };
}
