"use client";

import { ThemeProvider } from "next-themes";
import type { PropsWithChildren } from "react";
import { MswProvider } from "./msw-provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <MswProvider>{children}</MswProvider>
    </ThemeProvider>
  );
}
