import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModeBadge } from "./mode-badge";

afterEach(cleanup);

describe("ModeBadge", () => {
  it("says devnet outside /fund", () => {
    render(<ModeBadge mode="staging" />);
    expect(screen.getAllByText("Devnet").length).toBeGreaterThan(0);
  });

  it("says real funds on mainnet on /fund", () => {
    render(<ModeBadge mode="staging" funds />);
    expect(screen.getByText("Mainnet · real funds")).toBeTruthy();
    expect(screen.queryByText("Devnet")).toBeNull();
  });

  it("says no real funds move in mock mode on /fund", () => {
    render(<ModeBadge mode="mock" funds />);
    expect(screen.getByText("Mock mode · no real funds")).toBeTruthy();
  });
});
