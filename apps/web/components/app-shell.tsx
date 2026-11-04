"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TopBar } from "@/components/top-bar";

export { isActive } from "@/lib/nav";

/** La misma barra superior en todas las páginas y, debajo, la página a todo el ancho. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <TopBar pathname={pathname} />
      <div className="min-w-0">{children}</div>
    </>
  );
}
