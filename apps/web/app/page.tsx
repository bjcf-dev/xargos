import { ArrowRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Eyebrow } from "@/components/eyebrow";
import { buttonVariants } from "@/components/ui/button";
import { GuaranteeTicker } from "./guarantee-ticker";
import { HowItWorks } from "./how-it-works";
import { RecipeList } from "./recipe-list";

/**
 * El busto de Argos, grande y a sangre por la derecha (referencia de la guía): sale por el borde
 * superior de la página y se difumina hacia el texto y hacia abajo. "Respira" despacio; con
 * movimiento reducido, quieto. Los anillos van centrados en el ojo y respiran con él.
 */
function HeroBust() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[62%] mask-hero-bust md:block"
    >
      <div className="absolute inset-0 bg-reticle opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_32%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_55%)]" />
      <div className="absolute -top-[12%] -right-[4%] aspect-[986/1318] h-[128%] origin-[37%_36%] animate-breathe">
        <Image
          src="/brand/argos-bust.png"
          alt=""
          fill
          priority
          quality={90}
          sizes="(min-width: 768px) 38rem, 1px"
          className="object-contain"
        />
        {/* Anillos del iris (guía §4), centrados en el ojo de la escultura. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 200 200"
          fill="none"
          className="absolute top-[35.5%] left-[37%] size-[95%] -translate-x-1/2 -translate-y-1/2 text-primary"
        >
          <circle cx="100" cy="100" r="96" stroke="currentColor" strokeOpacity="0.18" />
          <circle cx="100" cy="100" r="70" stroke="currentColor" strokeOpacity="0.28" />
          <circle cx="100" cy="100" r="44" stroke="currentColor" strokeOpacity="0.4" />
          <circle cx="4" cy="100" r="1.6" fill="currentColor" />
          <circle cx="170" cy="100" r="1.6" fill="currentColor" />
          <circle cx="131" cy="131" r="1.4" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Título del cierre. Sin "in 30 seconds": en mock la demo A tarda unos 11 s, pero en devnet la
 * preparación del agente es real y no está medida. Se puede añadir cuando se mida en staging.
 */
export const CLOSING_TITLE = "Try it on devnet";

export default function Home() {
  return (
    <main className="flex flex-col">
      <section className="relative isolate overflow-hidden">
        <HeroBust />
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-24">
          <div className="flex max-w-2xl flex-col gap-5">
            <Eyebrow>x402 payments on Solana</Eyebrow>
            <h1 className="font-display text-5xl leading-none font-light tracking-tight text-balance sm:text-7xl lg:text-8xl">
              Delivered as promised, <span className="text-primary">or not executed at all.</span>
            </h1>
            <p className="max-w-lg leading-relaxed text-muted-foreground">
              Multi-step DeFi recipes for AI agents, paid per request with x402 on Solana devnet.
              One transaction, guarded on-chain: below the guaranteed minimum, it reverts entirely.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link href="/demo" className={buttonVariants({ size: "lg", className: "px-4" })}>
                Open the demo
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
              {/* Ancla del navegador, no Link: desplaza siempre, también en el segundo clic. */}
              <a
                href="#how-it-works"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "bg-card px-4 dark:bg-card",
                })}
              >
                How it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-16 md:gap-24 md:px-10">
        <GuaranteeTicker />
        <HowItWorks />
        <section className="flex flex-col gap-4">
          <Eyebrow>Recipes</Eyebrow>
          <RecipeList />
        </section>
        <section className="flex flex-col items-center gap-6 rounded-2xl border bg-card px-6 py-14 text-center">
          <h2 className="font-display text-4xl leading-none font-light tracking-tight sm:text-5xl">
            {CLOSING_TITLE}
          </h2>
          <Link href="/demo" className={buttonVariants({ size: "lg", className: "px-4" })}>
            Open the demo
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </section>
      </div>
    </main>
  );
}
