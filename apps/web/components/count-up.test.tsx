import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CountUp } from "./count-up";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the exact value when motion is reduced", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<CountUp value="9.1" />);
  expect(screen.getByText("9.1")).toBeDefined();
});

it("shows the exact value without matchMedia", () => {
  vi.stubGlobal("matchMedia", undefined);
  render(<CountUp value="12.480001" />);
  expect(screen.getByText("12.480001")).toBeDefined();
});

it("ends on the exact value, not a rounded one", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  render(<CountUp value="9.95" durationMs={30} />);
  expect(await screen.findByText("9.95", {}, { timeout: 1_000 })).toBeDefined();
});
