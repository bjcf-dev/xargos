import Link from "next/link";
import { ModeBadge } from "@/components/mode-badge";
import { ThemeToggle } from "@/components/theme-toggle";

/** Cabecera de todas las páginas: el logo vuelve a la portada. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
      <Link href="/" className="font-mono text-sm font-bold">
        xARGOS
      </Link>
      <div className="flex items-center gap-3">
        <ModeBadge />
        <ThemeToggle />
      </div>
    </header>
  );
}
