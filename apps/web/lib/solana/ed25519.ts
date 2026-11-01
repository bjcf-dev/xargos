/**
 * Ed25519 nativo en Web Crypto (Chrome 137, Firefox 129, Safari 17). Sin él no hay agente:
 * no usamos polyfill, porque su clave no sería una CryptoKey del navegador (D30).
 */
export async function isEd25519Supported(
  subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null,
): Promise<boolean> {
  if (!subtle) return false;
  try {
    await subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    return true;
  } catch {
    return false;
  }
}
