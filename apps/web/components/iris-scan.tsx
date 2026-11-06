import { cn } from "@/lib/utils";

/**
 * El iris de Argos (guía de identidad §6): anillos finos y un barrido que gira.
 * Solo mientras hay una comprobación real en marcha; con movimiento reducido, quieto.
 */
export function IrisScan({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={cn("size-8 shrink-0 text-primary", className)}
    >
      <circle cx="20" cy="20" r="17" stroke="currentColor" strokeOpacity="0.3" />
      <circle cx="20" cy="20" r="10" stroke="currentColor" strokeOpacity="0.6" />
      <circle cx="20" cy="20" r="3.5" fill="currentColor" />
      <path
        d="M20 3a17 17 0 0 1 17 17"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="animate-spin [animation-duration:1.6s]"
        style={{ transformOrigin: "20px 20px" }}
      />
    </svg>
  );
}
