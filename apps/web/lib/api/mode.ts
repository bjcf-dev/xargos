import { z } from "zod";

/**
 * mock: MSW intercepta /api/xargos/* en el navegador (sin backend ni secretos).
 * local | staging: las peticiones llegan al proxy, que decide el backend (F5).
 */
export const ApiMode = z.enum(["mock", "local", "staging"]);
export type ApiMode = z.infer<typeof ApiMode>;

export function parseApiMode(value: string | undefined): ApiMode {
  if (!value) return "mock";
  const parsed = ApiMode.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `NEXT_PUBLIC_API_MODE="${value}" is not valid; use ${ApiMode.options.join(" | ")}`,
    );
  }
  return parsed.data;
}

// Acceso literal: Next solo sustituye NEXT_PUBLIC_* escritas así en el bundle.
export const apiMode: ApiMode = parseApiMode(process.env.NEXT_PUBLIC_API_MODE);
