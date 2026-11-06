import { CountUp } from "@/components/count-up";

/**
 * Dónde caen en la barra lo recibido y el mínimo del guard, en %. La escala va de un poco por
 * debajo de la cifra más baja hasta la más alta (normalmente lo esperado): a escala completa
 * desde 0, 9,1 y 9,95 quedarían casi en el mismo sitio y no se vería la diferencia.
 */
export function barScale(
  value: bigint,
  minimum: bigint,
  expected: bigint,
): { valuePct: number; minPct: number } {
  const lowest = value < minimum ? value : minimum;
  // Math.max no admite bigint.
  let highest = expected;
  for (const x of [value, minimum]) if (x > highest) highest = x;
  const span = highest - lowest;
  if (span === 0n) return { valuePct: 100, minPct: 100 };
  const floor = lowest - span / 4n;
  const lo = floor > 0n ? floor : 0n;
  const pct = (x: bigint) => Number(((x - lo) * 10_000n) / (highest - lo)) / 100;
  return { valuePct: pct(value), minPct: pct(minimum) };
}

type GuaranteeBarProps = {
  /** Lo que habría recibido el agente (GUARD_FAIL) y el mínimo del guard, en unidades base. */
  value: bigint;
  minimum: bigint;
  /** Lo esperado por la cotización: fija el final de la escala. */
  expected: bigint;
  /** Las mismas cifras ya formateadas, tal como salen en el texto. */
  valueText: string;
  minimumText: string;
  token: string;
};

/**
 * Lo que habría recibido el agente frente al mínimo del guard, en el color de protección.
 * El lector de pantalla lee la frase entera (role="img"); la barra y la cifra animada son visuales.
 */
export function GuaranteeBar({
  value,
  minimum,
  expected,
  valueText,
  minimumText,
  token,
}: GuaranteeBarProps) {
  const { valuePct, minPct } = barScale(value, minimum, expected);
  // La etiqueta de la cifra no se sale por los bordes.
  const labelPct = Math.min(Math.max(valuePct, 8), 92);
  return (
    <div
      role="img"
      aria-label={`Would have received ${valueText} ${token}, guaranteed minimum ${minimumText} ${token}`}
      className="flex flex-col gap-1.5 pt-6 pb-1"
    >
      <div className="relative h-2.5 rounded-full bg-card ring-1 ring-protect/25">
        <div
          className="absolute inset-y-0 left-0 origin-left animate-grow-x rounded-full bg-protect"
          style={{ width: `${valuePct}%` }}
        />
        <div className="absolute -inset-y-1.5 w-0.5 bg-foreground" style={{ left: `${minPct}%` }}>
          <span className="absolute -top-5 right-0 font-mono text-xs whitespace-nowrap text-foreground">
            min {minimumText}
          </span>
        </div>
      </div>
      <div className="relative h-4">
        <span
          className="absolute -translate-x-1/2 font-mono text-xs font-semibold text-protect"
          style={{ left: `${labelPct}%` }}
        >
          <CountUp value={valueText} />
        </span>
      </div>
    </div>
  );
}
