/** Contrato: importes en unidades base. USDC tiene 6 decimales; SOL, 9. */
export const USDC_DECIMALS = 6;
export const SOL_DECIMALS = 9;

/**
 * Unidades base → texto decimal exacto, sin ceros de sobra ("9950000", 6 → "9.95").
 * Con bigint en todo momento: nada de Number, que pierde precisión.
 */
export function formatUnits(base: string | bigint, decimals: number): string {
  if (typeof base === "string" && !/^\d+$/.test(base)) {
    throw new Error(`Not base units: "${base}"`);
  }
  const value = BigInt(base);
  if (value < 0n) throw new Error(`Not base units: ${value}`);

  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
