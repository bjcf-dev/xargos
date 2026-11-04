// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La paleta de la guía de identidad tiene que leerse: cada texto sobre su fondo llega a 4,5:1
 * (WCAG AA, texto normal) en los dos temas. Lee los tokens de globals.css, así que un color
 * cambiado sin mirar el contraste rompe este test.
 */
const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} not found in globals.css`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );
}

function luminance(hex: string): number {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!digits) throw new Error(`expected a #rrggbb color, got ${hex}`);
  const channel = (i: number) => {
    const c = Number.parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** [texto, fondo]: lo que la app pinta una sobre otra. */
const PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "panel-raised"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  ["primary", "card"],
  ["primary", "primary-soft"],
  ["success", "card"],
  ["success", "success-soft"],
  ["warning", "card"],
  ["warning", "warning-soft"],
  ["destructive", "card"],
  ["destructive", "destructive-soft"],
  ["protect", "card"],
  ["protect", "protect-soft"],
  ["brand-gold", "card"],
];

describe.each([":root", ".dark"])("theme %s", (selector) => {
  const tokens = block(selector);

  it.each(PAIRS)("%s on %s reaches 4.5:1", (text, surface) => {
    const fg = tokens[text];
    const bg = tokens[surface];
    expect(fg, `--${text} is missing`).toBeDefined();
    expect(bg, `--${surface} is missing`).toBeDefined();
    expect(contrast(fg as string, bg as string)).toBeGreaterThanOrEqual(4.5);
  });
});
