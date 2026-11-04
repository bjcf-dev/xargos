import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Antetítulo de la guía: mono en turquesa y una línea fina de oro a magenta (firma de marca). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 font-mono text-xs font-medium tracking-[0.12em] text-primary uppercase",
        "after:h-px after:w-12 after:bg-linear-to-r after:from-brand-gold after:to-brand-magenta after:content-['']",
        className,
      )}
    >
      {children}
    </p>
  );
}
