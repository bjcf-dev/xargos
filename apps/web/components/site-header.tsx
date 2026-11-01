import Image from "next/image";
import Link from "next/link";
import { ModeBadge } from "@/components/mode-badge";
import { ThemeToggle } from "@/components/theme-toggle";

/** Cabecera de todas las páginas: el logo vuelve a la portada; los pagos fallidos, a mano del jurado. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
      <Link href="/" className="flex items-center gap-2 font-mono text-sm font-bold">
        {/* alt vacío: el texto ya dice el nombre. El fondo de la X es oscuro, también en tema claro. */}
        <Image src="/logo-mark.png" alt="" width={24} height={24} className="rounded-sm" />
        xARGOS
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/failed-payments"
          className="hidden text-sm text-muted-foreground underline-offset-4 hover:underline sm:inline"
        >
          Failed payments
        </Link>
        <ModeBadge />
        <ThemeToggle />
      </div>
    </header>
  );
}
