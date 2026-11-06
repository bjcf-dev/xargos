import { FlaskConicalIcon, GlobeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type ApiMode, apiMode } from "@/lib/api/mode";

const LABELS: Record<ApiMode, { short: string; long: string }> = {
  mock: { short: "Mock", long: "Mock mode · no devnet transactions" },
  local: { short: "Devnet", long: "Devnet · local API" },
  staging: { short: "Devnet", long: "Devnet" },
};

/** En /fund el dinero es real y va por mainnet (D31): la etiqueta lo dice, no "Devnet". */
const FUND_LABELS: Record<"mock" | "real", { short: string; long: string }> = {
  mock: { short: "Mock", long: "Mock mode · no real funds" },
  real: { short: "Mainnet", long: "Mainnet · real funds" },
};

/** Siempre visible: el juez tiene que saber si lo que ve es simulado o real. En el móvil, corta. */
export function ModeBadge({
  mode = apiMode,
  funds = false,
  className,
}: {
  mode?: ApiMode;
  /** En /fund: la etiqueta habla de fondos reales en mainnet. */
  funds?: boolean;
  className?: string;
}) {
  const Icon = mode === "mock" ? FlaskConicalIcon : GlobeIcon;
  const { short, long } = funds ? FUND_LABELS[mode === "mock" ? "mock" : "real"] : LABELS[mode];
  return (
    <Badge variant={mode === "mock" ? "outline" : "secondary"} className={className}>
      <Icon data-icon="inline-start" />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </Badge>
  );
}
