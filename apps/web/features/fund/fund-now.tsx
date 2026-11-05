"use client";

import { ExternalLinkIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FUND_COPY } from "./copy";
import { formatCountdown, useCountdown } from "./countdown";
import type { FundLink, FundNow, FundTone } from "./view";

/** Borde y color del título según el tono: ámbar si hay que actuar, rojo solo si no sabemos. */
const TONE: Record<FundTone, { border: string; title: string }> = {
  progress: { border: "border-primary", title: "" },
  action: { border: "border-warning", title: "text-warning" },
  success: { border: "border-success", title: "text-success" },
  info: { border: "border-protect", title: "text-protect" },
  danger: { border: "border-destructive", title: "text-destructive" },
};

const ARRIVING_STEPS = ["Deposit seen", "Swapping to USDC", "Delivered"] as const;

function Address({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm break-all">{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function SendBy({ left }: { left: number | undefined }) {
  if (left === undefined) return null;
  return (
    <p className="text-sm">
      Send within <strong className="text-warning tabular-nums">{formatCountdown(left)}</strong>
    </p>
  );
}

function Links({ links }: { links: FundLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {l.label}
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** El único paso abierto de /fund: qué hacer ahora, o cómo terminó. */
export function FundNowBlock({
  now,
  tone,
  deadline,
  canStartOver,
  onStartOver,
  onNewQuote,
}: {
  now: Exclude<FundNow, { kind: "form" }>;
  tone: FundTone;
  deadline: number | undefined;
  canStartOver: boolean;
  onStartOver(): void;
  onNewQuote(): void;
}) {
  const finished = now.kind === "success" || now.kind === "refunded";
  // Con el plazo vencido no se ofrece la dirección: lo que llegue ahora vuelve como reembolso.
  const left = useCountdown(deadline);
  const timeUp = left === 0;
  return (
    <section className={cn("flex flex-col gap-3 border-l-4 py-1 pl-4", TONE[tone].border)}>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {finished ? "Done" : "Now"}
      </p>
      <h3
        data-step-title
        tabIndex={-1}
        className={cn("text-xl font-semibold outline-offset-4", TONE[tone].title)}
      >
        {timeUp && (now.kind === "send" || now.kind === "incomplete")
          ? FUND_COPY.now.timeUpTitle
          : now.title}
      </h3>

      {(now.kind === "send" || now.kind === "incomplete") && (
        <>
          {now.kind === "incomplete" && <p className="text-sm text-muted-foreground">{now.note}</p>}
          {timeUp ? (
            <p className="text-sm font-medium text-warning">
              {now.kind === "send" ? FUND_COPY.now.timeUp : FUND_COPY.now.timeUpIncomplete}
            </p>
          ) : (
            <>
              <Address value={now.address} label="Copy the deposit address" />
              {now.memo && <Address value={now.memo} label="Copy the memo" />}
              <SendBy left={left} />
              {now.kind === "send" && (
                <p className="text-sm text-muted-foreground">From your own wallet.</p>
              )}
            </>
          )}
        </>
      )}

      {now.kind === "arriving" && (
        <>
          <ol className="flex flex-wrap items-center gap-3 text-sm">
            {ARRIVING_STEPS.map((step, i) => {
              const done = i < now.stage;
              return (
                <li key={step} data-done={String(done)} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn("size-2.5 rounded-full", done ? "bg-primary" : "bg-muted")}
                  />
                  <span className={done ? "" : "text-muted-foreground"}>{step}</span>
                </li>
              );
            })}
          </ol>
          {now.estimate && <p className="text-sm text-muted-foreground">{now.estimate}</p>}
        </>
      )}

      {(now.kind === "success" || now.kind === "refunded") && (
        <>
          <p className="text-sm text-muted-foreground">{now.note}</p>
          <Links links={now.links} />
        </>
      )}

      {now.kind === "failed" && (
        <>
          <p className="text-sm text-muted-foreground">{now.note}</p>
          <Address value={now.address} label="Copy the deposit address" />
        </>
      )}

      {now.kind === "expired" && (
        <>
          <p className="text-sm text-muted-foreground">{now.note}</p>
          <Button type="button" variant="outline" className="self-start" onClick={onNewQuote}>
            Get a new address
          </Button>
        </>
      )}

      {canStartOver && now.kind !== "expired" && (
        <Button type="button" variant="outline" className="self-start" onClick={onStartOver}>
          Start over
        </Button>
      )}
    </section>
  );
}
