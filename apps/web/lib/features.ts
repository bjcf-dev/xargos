/** Una bandera de función: solo está encendida con el valor exacto "true". */
export function parseFeatureFlag(value: string | undefined): boolean {
  return value === "true";
}

/**
 * /fund (Aurora Intents, mainnet, D31). Apagada por defecto: en producción se enciende solo tras el
 * swap real del B18. Es NEXT_PUBLIC_*: se fija al construir, así que encenderla es otro deploy.
 * Acceso literal: Next solo sustituye NEXT_PUBLIC_* escritas así en el bundle.
 */
export const auroraEnabled = parseFeatureFlag(process.env.NEXT_PUBLIC_FEATURE_AURORA);
