import type { Metadata } from "next";
import { Antonio, Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Letra de los titulares grandes de la portada (condensada, alta y fina). Solo el peso 300.
const antonio = Antonio({
  variable: "--font-antonio",
  subsets: ["latin"],
  weight: "300",
});

export const metadata: Metadata = {
  title: "xARGOS",
  description:
    "Multi-step DeFi recipes for AI agents, paid per request with x402 on Solana: kept as promised or not executed at all.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El nonce de la CSP (proxy.ts): el script inline de next-themes lo necesita para correr.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, geistMono.variable, antonio.variable)}
    >
      <body className="antialiased">
        <Providers nonce={nonce}>
          <div className="min-h-screen bg-background text-foreground">
            <AppShell>{children}</AppShell>
          </div>
        </Providers>
      </body>
    </html>
  );
}
