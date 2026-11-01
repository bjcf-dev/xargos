import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

afterEach(cleanup);

it("links the logo back to the home page", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("link", { name: "xARGOS" }).getAttribute("href")).toBe("/");
});
