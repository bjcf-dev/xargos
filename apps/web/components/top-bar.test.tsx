import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Con la bandera de Aurora encendida (sin ella, app-shell.test.tsx comprueba la barra de siempre).
vi.mock("@/lib/features", () => ({ auroraEnabled: true }));

import { TopBar } from "./top-bar";

afterEach(cleanup);

describe("TopBar with Aurora on", () => {
  it("links to /fund", () => {
    render(<TopBar pathname="/" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Fund" }).getAttribute("href")).toBe("/fund");
  });

  it("says real funds are involved while on /fund", () => {
    render(<TopBar pathname="/fund" />);
    expect(screen.getByText("Mock mode · no real funds")).toBeTruthy();
  });

  it("keeps the devnet label elsewhere", () => {
    render(<TopBar pathname="/demo" />);
    expect(screen.queryByText(/real funds/)).toBeNull();
  });
});
