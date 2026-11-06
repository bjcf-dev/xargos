import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { AppShell, isActive } from "./app-shell";

afterEach(cleanup);
// Cada test empieza en la portada; los que necesitan otra ruta la cambian.
beforeEach(() => {
  pathname.current = "/";
});

describe("AppShell", () => {
  it("links the logo back to the home page", () => {
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole("link", { name: "xARGOS" }).getAttribute("href")).toBe("/");
  });

  it("marks only the current page in the navigation", () => {
    pathname.current = "/demo";
    render(<AppShell>page</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect([...nav.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent)).toEqual([
      "Demo",
    ]);
  });

  // La misma barra superior en todas las páginas, sin barra lateral.
  it.each(["/", "/demo", "/failed-payments"])("shows the same top bar on %s", (path) => {
    pathname.current = path;
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole("banner")).toBeDefined();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav)
      .getAllByRole("link")
      .map((a) => [a.textContent, a.getAttribute("href")]);
    // En la portada, ancla de la propia página: el navegador desplaza siempre, también si la
    // dirección ya acaba en #how-it-works (con Link de Next, el segundo clic no hacía nada).
    const howItWorks = path === "/" ? "#how-it-works" : "/#how-it-works";
    expect(links).toEqual([
      ["How it works", howItWorks],
      ["Demo", "/demo"],
      ["Failed payments", "/failed-payments"],
    ]);
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.getByRole("link", { name: /Open the demo/ }).getAttribute("href")).toBe("/demo");
  });

  it("renders the page next to the navigation", () => {
    render(<AppShell>the page</AppShell>);
    expect(screen.getByText("the page")).toBeDefined();
  });
});

describe("isActive", () => {
  it("matches the home page only exactly", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/demo", "/")).toBe(false);
  });

  it("matches a section and its subpages", () => {
    expect(isActive("/failed-payments", "/failed-payments")).toBe(true);
    expect(isActive("/demo/anything", "/demo")).toBe(true);
    expect(isActive("/demolition", "/demo")).toBe(false);
  });
});
