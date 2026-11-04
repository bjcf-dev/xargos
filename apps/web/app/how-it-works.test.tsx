import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOW_IT_WORKS_DONE_MS, HOW_IT_WORKS_INTERVAL_MS, HowItWorks } from "./how-it-works";

/** Los botones de los pasos: su nombre empieza por "1 · ", "2 · ", "3 · ". */
const steps = () => screen.getAllByRole("button", { name: /^\d · / });
/** Qué pasos están encendidos, por su número. */
const lit = () =>
  steps()
    .filter((b) => b.dataset.state === "on")
    .map((b) => b.textContent?.slice(0, 1));
const section = () => document.getElementById("how-it-works") as HTMLElement;
/** Estado de cada fila de la miniatura de la demo. */
const rows = () =>
  [...section().querySelectorAll<HTMLElement>("li[data-row-state]")].map(
    (li) => li.dataset.rowState,
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HowItWorks", () => {
  it("lists the three steps under its heading, linkable from the top bar", () => {
    render(<HowItWorks />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Three steps. One guarantee." }),
    ).toBeDefined();
    expect(steps().map((b) => b.querySelector("b")?.textContent)).toEqual([
      "1 · The agent pays",
      "2 · Gets one transaction",
      "3 · The guard checks",
    ]);
    // Bajo la barra fija: el ancla deja sitio arriba para que el título no quede tapado.
    expect(section().className).toMatch(/scroll-mt-/);
  });

  it("lights the next step by itself and goes back to the first after the last", () => {
    render(<HowItWorks />);
    expect(lit()).toEqual(["1"]);
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS));
    expect(lit()).toEqual(["2"]);
    // Paso a paso: cada uno programa el siguiente al dibujarse.
    for (let i = 0; i < 2; i++) act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS));
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_DONE_MS));
    expect(lit()).toEqual(["1"]);
  });

  it("shows the last check for a second before starting again", () => {
    render(<HowItWorks />);
    for (let i = 0; i < 2; i++) act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS));
    expect(rows()).toEqual(["done", "done", "active"]);
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS));
    // El tercer paso acaba: los tres hechos, con el último aún encendido.
    expect(rows()).toEqual(["done", "done", "done"]);
    expect(lit()).toEqual(["3"]);
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_DONE_MS - 1));
    expect(lit()).toEqual(["3"]);
    act(() => vi.advanceTimersByTime(1));
    expect(lit()).toEqual(["1"]);
    expect(rows()).toEqual(["active", "pending", "pending"]);
  });

  it("lets you pick a step and stops with the pause button", () => {
    render(<HowItWorks />);
    fireEvent.click(steps()[2] as HTMLElement);
    expect(lit()).toEqual(["3"]);
    fireEvent.click(screen.getByRole("button", { name: "Pause steps" }));
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS * 3));
    expect(lit()).toEqual(["3"]);
    expect(screen.getByRole("button", { name: "Play steps" })).toBeDefined();
  });

  it("stops every moving part when paused, the preview spinner too", () => {
    render(<HowItWorks />);
    expect(section().querySelector('[data-slot="spinner"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pause steps" }));
    expect(section().querySelector('[data-slot="spinner"]')).toBeNull();
  });

  // La sección es justo donde se pone el ratón para mirarla: pararse ahí la dejaba quieta.
  it("keeps moving with the pointer over it", () => {
    render(<HowItWorks />);
    fireEvent.mouseEnter(section());
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS));
    expect(lit()).toEqual(["2"]);
  });

  it("waits while the keyboard focus is inside", () => {
    render(<HowItWorks />);
    // Foco de teclado: llega sin un pointerdown antes.
    fireEvent.focus(steps()[0] as HTMLElement);
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS * 2));
    expect(lit()).toEqual(["1"]);
  });

  it("with reduced motion, shows every step lit and never moves", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<HowItWorks />);
    expect(lit()).toEqual(["1", "2", "3"]);
    act(() => vi.advanceTimersByTime(HOW_IT_WORKS_INTERVAL_MS * 3));
    expect(lit()).toEqual(["1", "2", "3"]);
  });

  it("shows no hand-written amounts", () => {
    render(<HowItWorks />);
    expect(section().textContent).not.toMatch(/\d+(\.\d+)?\s*(USDC|SOL)\b/);
  });
});
