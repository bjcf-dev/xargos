import { ArrowRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ModeBadge } from "@/components/mode-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { auroraEnabled } from "@/lib/features";
import { isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Solo las páginas que existen. "How it works" es una sección de la portada: funciona desde todas. */
export const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/demo", label: "Demo" },
  { href: "/failed-payments", label: "Failed payments" },
] as const;

/** /fund solo existe con la bandera de Aurora (D31): sin ella, ni la página ni el enlace. */
const FUND_NAV = { href: "/fund", label: "Fund" } as const;
const navItems = () => (auroraEnabled ? [...NAV, FUND_NAV] : NAV);

/**
 * La barra de toda la app (como las webs de referencia): fija arriba al desplazar, también en el
 * móvil. Por debajo de lg son dos filas (en una no caben enlaces, modo y botón): arriba la marca,
 * el modo (tiene que verse siempre), el tema y el botón; debajo, los enlaces. En el móvil no va el
 * botón "Open the demo": el enlace "Demo" hace lo mismo y así caben los tres enlaces.
 */
export function TopBar({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-sidebar/95 text-sidebar-foreground backdrop-blur supports-backdrop-filter:bg-sidebar/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-2.5 lg:flex-nowrap md:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md">
          {/* alt vacío: el texto ya dice el nombre. */}
          <Image
            src="/brand/emblem-x.png"
            alt=""
            width={85}
            height={56}
            priority
            className="h-6 w-auto"
          />
          <span className="text-sm font-semibold tracking-[0.16em] text-brand-gold uppercase">
            xARGOS
          </span>
        </Link>
        <div className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1">
          <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {navItems().map(({ href, label }) => {
              const active = isActive(pathname, href);
              const className = cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "bg-primary-soft font-semibold text-primary shadow-[inset_0_-2px_0_var(--brand-gold)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              );
              // En la portada, la sección está en la propia página: ancla del navegador, que desplaza
              // siempre. Con Link de Next, si la dirección ya acababa en el ancla no hacía nada.
              if (pathname === "/" && href.startsWith("/#")) {
                return (
                  <a key={href} href={href.slice(1)} className={className}>
                    {label}
                  </a>
                );
              }
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ModeBadge funds={isActive(pathname, "/fund")} />
          <ThemeToggle />
          {/* En el móvil no cabe: ahí el enlace "Demo" hace lo mismo. */}
          <Link
            href="/demo"
            className={cn(buttonVariants({ className: "px-3" }), "hidden sm:inline-flex")}
          >
            Open the demo
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </div>
      </div>
    </header>
  );
}
