import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

describe("CopyButton", () => {
  it("copies the value and says so", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    stubClipboard(writeText);
    render(<CopyButton value="0xdeposit" label="Copy the deposit address" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy the deposit address" }));
    });

    expect(writeText).toHaveBeenCalledWith("0xdeposit");
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("says it could not copy when the browser refuses", async () => {
    stubClipboard(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    render(<CopyButton value="0xdeposit" label="Copy the deposit address" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy the deposit address" }));
    });

    expect(screen.getByText("Copy failed")).toBeTruthy();
  });

  it("says it could not copy when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<CopyButton value="0xdeposit" label="Copy the deposit address" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy the deposit address" }));
    });

    expect(screen.getByText("Copy failed")).toBeTruthy();
  });
});
