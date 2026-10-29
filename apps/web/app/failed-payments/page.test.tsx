import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import FailedPaymentsPage from "./page";

afterEach(cleanup);

it("explains each failed payment case in a table", () => {
  render(<FailedPaymentsPage />);

  expect(screen.getByRole("heading", { level: 1, name: "Failed payments" })).toBeDefined();
  const table = screen.getByRole("table");
  const headers = within(table)
    .getAllByRole("columnheader")
    .map((th) => th.textContent);
  expect(headers).toEqual(["Case", "What happens", "Charged"]);
  // Cabecera + las 5 filas de "Pagos fallidos" de docs/api-contract.md.
  expect(within(table).getAllByRole("row")).toHaveLength(6);
});

it("says the guard revert is read from the chain, not assumed", () => {
  render(<FailedPaymentsPage />);

  const row = screen.getByRole("row", { name: /less than the minimum/i });
  expect(row.textContent).toMatch(/GUARD_FAIL/);
  expect(row.textContent).toMatch(/getTransaction/);
});

it("states that a failed build is never settled", () => {
  render(<FailedPaymentsPage />);

  const row = screen.getByRole("row", { name: /build or its simulation fails/i });
  expect(row.textContent).toMatch(/BUILD_FAILED/);
  expect(within(row).getAllByRole("cell").at(-1)?.textContent).toBe("No");
});
