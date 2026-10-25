import { FlaskConicalIcon, GlobeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type ApiMode, apiMode } from "@/lib/api/mode";

const LABELS: Record<ApiMode, string> = {
  mock: "Mock mode · no devnet transactions",
  local: "Devnet · local API",
  staging: "Devnet",
};

/** Siempre visible: el juez tiene que saber si lo que ve es simulado o real. */
export function ModeBadge({ mode = apiMode }: { mode?: ApiMode }) {
  const Icon = mode === "mock" ? FlaskConicalIcon : GlobeIcon;
  return (
    <Badge variant={mode === "mock" ? "outline" : "secondary"}>
      <Icon data-icon="inline-start" />
      {LABELS[mode]}
    </Badge>
  );
}
