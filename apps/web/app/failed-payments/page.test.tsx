import { cleanup, render, screen, within } from "@testing-library/react";
import { ERROR_HTTP } from "@xargos/shared";
import { afterEach, expect, it } from "vitest";
import { FAILED_PAYMENT_CASES } from "./cases";
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

it("says in words what each case charges, not only with a color", () => {
  render(<FailedPaymentsPage />);

  const table = screen.getByRole("table");
  const charged = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").at(-1)?.textContent);
  expect(charged).toEqual([
    "No",
    "No",
    "No",
    "Once · the rebuild is free",
    "Fees · the recipe fee and the network fee; the position and funds stay intact",
  ]);
});

it("marks the guard revert as an on-chain protection, not as an HTTP error", () => {
  render(<FailedPaymentsPage />);

  const row = screen.getByRole("row", { name: /less than the minimum/i });
  expect(row.textContent).toContain("On-chain revert");
  expect(row.textContent).not.toMatch(/\b[45]\d\d\b/);
});

// Contract drift: el status que enseña la página sale de ERROR_HTTP, nunca escrito a mano.
const withCode = FAILED_PAYMENT_CASES.filter((row) => row.code !== null);

it("ties every error code on the page to the contract", () => {
  expect(withCode.map((row) => row.code)).toEqual([
    "PAYMENT_REQUIRED",
    "PAYMENT_INVALID",
    "BUILD_FAILED",
    "REBUILD_WINDOW_CLOSED",
  ]);
});

it.each(withCode)("shows the contract status for $code in the table and the list", (row) => {
  render(<FailedPaymentsPage />);

  const label = `${ERROR_HTTP[row.code ?? "INTERNAL"].status} ${row.code}`;
  const tableRow = screen.getByRole("row", { name: (name) => name.startsWith(row.case) });
  expect(tableRow.textContent).toContain(label);
  expect(screen.getByRole("listitem", { name: row.case }).textContent).toContain(label);
});

it("writes no HTTP status by hand in the case texts", () => {
  for (const row of FAILED_PAYMENT_CASES) expect(row.response).not.toMatch(/\b[1-5]\d\d\b/);
});
