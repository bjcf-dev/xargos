"use client";

import { ThemeProvider } from "next-themes";
import type { PropsWithChildren } from "react";
import { MswProvider } from "./msw-provider";

export function Providers({ children, nonce }: PropsWithChildren<{ nonce?: string | undefined }>) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" {...(nonce ? { nonce } : {})}>
      <MswProvider>{children}</MswProvider>
    </ThemeProvider>
  );
}
