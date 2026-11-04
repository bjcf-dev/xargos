import { FlaskConicalIcon, GlobeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type ApiMode, apiMode } from "@/lib/api/mode";

const LABELS: Record<ApiMode, { short: string; long: string }> = {
  mock: { short: "Mock", long: "Mock mode · no devnet transactions" },
  local: { short: "Devnet", long: "Devnet · local API" },
  staging: { short: "Devnet", long: "Devnet" },
};

/** Siempre visible: el juez tiene que saber si lo que ve es simulado o real. En el móvil, corta. */
export function ModeBadge({ mode = apiMode, className }: { mode?: ApiMode; className?: string }) {
  const Icon = mode === "mock" ? FlaskConicalIcon : GlobeIcon;
  const { short, long } = LABELS[mode];
  return (
    <Badge variant={mode === "mock" ? "outline" : "secondary"} className={className}>
      <Icon data-icon="inline-start" />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </Badge>
  );
}
