"use client";

import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const FEEDBACK_MS = 2_000;

/**
 * Copia un valor (una dirección) al portapapeles. Si el navegador no deja, lo dice: el valor
 * sigue escrito al lado, así que se puede copiar a mano.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("No clipboard");
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }

  const Icon = result === "copied" ? CheckIcon : result === "failed" ? XIcon : CopyIcon;
  return (
    <Button type="button" variant="outline" size="sm" aria-label={label} onClick={copy}>
      <Icon data-icon="inline-start" />
      <span aria-live="polite">
        {result === "copied" ? "Copied" : result === "failed" ? "Copy failed" : "Copy"}
      </span>
    </Button>
  );
}
