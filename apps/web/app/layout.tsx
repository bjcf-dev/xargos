import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "xARGOS",
  description:
    "Multi-step DeFi recipes for AI agents, paid per request with x402 on Solana: kept as promised or not executed at all.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, geistMono.variable)}
    >
      <body className="antialiased">
        <Providers>
          <div className="min-h-screen bg-background text-foreground">
            <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
              <span className="font-mono text-sm font-bold">xARGOS</span>
              <ThemeToggle />
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
