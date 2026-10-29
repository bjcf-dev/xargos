import Link from "next/link";
import { ModeBadge } from "@/components/mode-badge";
import { ThemeToggle } from "@/components/theme-toggle";

/** Cabecera de todas las páginas: el logo vuelve a la portada; los pagos fallidos, a mano del jurado. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
      <Link href="/" className="font-mono text-sm font-bold">
        xARGOS
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/failed-payments"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Failed payments
        </Link>
        <ModeBadge />
        <ThemeToggle />
      </div>
    </header>
  );
}
