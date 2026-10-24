import { render, screen } from "@testing-library/react";
import { fixtureRecipe } from "@xargos/shared";
import { expect, it } from "vitest";
import Home from "./page";

it("renders the recipe parsed from the shared contract", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { level: 1, name: "xARGOS" })).toBeDefined();
  expect(screen.getByRole("heading", { level: 2, name: fixtureRecipe.name })).toBeDefined();
});
