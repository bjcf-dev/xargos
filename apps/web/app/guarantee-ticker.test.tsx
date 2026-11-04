import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuaranteeTicker, TICKER_INTERVAL_MS } from "./guarantee-ticker";

const ITEMS = ["First guarantee", "Second guarantee", "Third guarantee"];
const NoIcon = () => null;
const items = ITEMS.map((text) => ({ text, Icon: NoIcon }));

function shown() {
  return screen.getByRole("group", { name: /of 3/ }).textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GuaranteeTicker", () => {
  it("shows one guarantee at a time and moves to the next one by itself", () => {
    render(<GuaranteeTicker items={items} />);
    expect(shown()).toBe("First guarantee");
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS));
    expect(shown()).toBe("Second guarantee");
  });

  it("goes back to the first after the last", () => {
    render(<GuaranteeTicker items={items} />);
    // Diapositiva a diapositiva: cada una programa la siguiente al dibujarse.
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS));
    expect(shown()).toBe("First guarantee");
  });

  it("stops with the pause button and starts again with play", () => {
    render(<GuaranteeTicker items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause guarantees" }));
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS * 2));
    expect(shown()).toBe("First guarantee");
    fireEvent.click(screen.getByRole("button", { name: "Play guarantees" }));
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS));
    expect(shown()).toBe("Second guarantee");
  });

  // Con el ratón, como lo usa una persona: el puntero sigue encima y el botón se queda el foco.
  it("moves again right after play, with the pointer over it and the button focused", () => {
    render(<GuaranteeTicker items={items} />);
    const region = screen.getByRole("region", { name: "Guarantees" });
    fireEvent.mouseEnter(region);
    const pause = screen.getByRole("button", { name: "Pause guarantees" });
    fireEvent.pointerDown(pause);
    fireEvent.focus(pause);
    fireEvent.click(pause);
    const play = screen.getByRole("button", { name: "Play guarantees" });
    fireEvent.pointerDown(play);
    fireEvent.click(play);
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS));
    expect(shown()).toBe("Second guarantee");
  });

  // La línea de progreso sigue desde donde se paró: la diapositiva tiene que cambiar a la vez.
  it("after play, waits only for the time that was left, not a whole slide", () => {
    render(<GuaranteeTicker items={items} />);
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole("button", { name: "Pause guarantees" }));
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole("button", { name: "Play guarantees" }));
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS - 2_000 + 50));
    expect(shown()).toBe("Second guarantee");
  });

  it("gives a whole slide again after moving on", () => {
    render(<GuaranteeTicker items={items} />);
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS));
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS - 100));
    expect(shown()).toBe("Second guarantee");
    act(() => vi.advanceTimersByTime(100));
    expect(shown()).toBe("Third guarantee");
  });

  it("still stops when keyboard focus enters it", () => {
    render(<GuaranteeTicker items={items} />);
    fireEvent.focus(screen.getByRole("button", { name: "Show guarantee 2 of 3" }));
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS * 2));
    expect(shown()).toBe("First guarantee");
  });

  it("jumps to the guarantee picked with its dot", () => {
    render(<GuaranteeTicker items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Show guarantee 3 of 3" }));
    expect(shown()).toBe("Third guarantee");
    expect(
      screen.getByRole("button", { name: "Show guarantee 3 of 3" }).getAttribute("aria-current"),
    ).toBe("true");
  });

  it("does not move while the pointer is over it", () => {
    render(<GuaranteeTicker items={items} />);
    fireEvent.mouseEnter(screen.getByRole("region", { name: "Guarantees" }));
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS * 2));
    expect(shown()).toBe("First guarantee");
  });

  it("does not move by itself when motion is reduced", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<GuaranteeTicker items={items} />);
    act(() => vi.advanceTimersByTime(TICKER_INTERVAL_MS * 2));
    expect(shown()).toBe("First guarantee");
  });
});
