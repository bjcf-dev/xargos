import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FundNowBlock } from "./fund-now";
import type { FundNow, FundTone } from "./view";

afterEach(cleanup);

const ADDRESS = "0xdeposit000000000000000000000000000000ab";

function show(
  now: Exclude<FundNow, { kind: "form" }>,
  {
    tone = "progress",
    deadline,
    canStartOver = false,
  }: { tone?: FundTone; deadline?: number; canStartOver?: boolean } = {},
) {
  const onStartOver = vi.fn();
  const onNewQuote = vi.fn();
  render(
    <FundNowBlock
      now={now}
      tone={tone}
      deadline={deadline}
      canStartOver={canStartOver}
      onStartOver={onStartOver}
      onNewQuote={onNewQuote}
    />,
  );
  return { onStartOver, onNewQuote };
}

describe("FundNowBlock", () => {
  it("shows where to send and how long is left", () => {
    show(
      { kind: "send", title: "Send exactly 2 USDC on Base", address: ADDRESS },
      { deadline: Date.now() + 581_500 },
    );
    expect(screen.getByRole("heading", { name: "Send exactly 2 USDC on Base" })).toBeTruthy();
    expect(screen.getByText(ADDRESS)).toBeTruthy();
    expect(screen.getByText(/send within/i).textContent).toContain("9:41");
    expect(screen.getByRole("button", { name: /copy the deposit address/i })).toBeTruthy();
  });

  it("warns never to send after the address goes inactive", () => {
    const neverAfter = "Never send after 12:30: Aurora stops watching this address.";
    show(
      { kind: "send", title: "Send exactly 2 USDC on Base", address: ADDRESS, neverAfter },
      { deadline: Date.now() + 60_000 },
    );
    expect(screen.getByText(neverAfter)).toBeTruthy();
  });

  it("shows no countdown at all without a time limit", () => {
    show({ kind: "send", title: "Send exactly 2 USDC on Base", address: ADDRESS });
    expect(screen.queryByText(/send within/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/0:00|NaN/);
  });

  it("stops offering the address once the time to send is up", () => {
    show(
      { kind: "send", title: "Send exactly 2 USDC on Base", address: ADDRESS },
      { deadline: Date.now() - 1_000 },
    );
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.getByText(/don't send to this address/i)).toBeTruthy();
    // El título ya no dice "Send exactly…": se contradiría con el aviso.
    expect(screen.getByRole("heading", { name: "Time's up" })).toBeTruthy();
  });

  it("stops asking for the rest once the time to send is up", () => {
    show(
      {
        kind: "incomplete",
        title: "Send 0.8 USDC more",
        note: "To the same address…",
        address: ADDRESS,
      },
      { tone: "action", deadline: Date.now() - 1_000 },
    );
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(screen.getByText(/don't send more/i)).toBeTruthy();
  });

  it("only says it is checking while a restored deposit is looked up", () => {
    show({ kind: "checking", title: "Checking your deposit…" }, { deadline: Date.now() + 60_000 });
    expect(screen.getByRole("heading", { name: "Checking your deposit…" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/send within/i)).toBeNull();
  });

  it("shows the memo with its own copy button when there is one", () => {
    show({ kind: "send", title: "Send exactly 2", address: ADDRESS, memo: "m1" });
    expect(screen.getByText("m1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy the memo/i })).toBeTruthy();
  });

  it("asks for the rest of an incomplete deposit, at the same address", () => {
    show(
      {
        kind: "incomplete",
        title: "Send 0.8 USDC more",
        note: "To the same address…",
        address: ADDRESS,
      },
      { tone: "action", deadline: Date.now() + 60_000 },
    );
    expect(screen.getByRole("heading", { name: "Send 0.8 USDC more" })).toBeTruthy();
    expect(screen.getByText(ADDRESS)).toBeTruthy();
    expect(screen.getByText("To the same address…")).toBeTruthy();
  });

  it("marks how far the swap got", () => {
    show({
      kind: "arriving",
      title: "Swapping to USDC…",
      stage: 2,
      estimate: "Usually about 40 s",
    });
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((s) => s.getAttribute("data-done"))).toEqual(["true", "true", "false"]);
    expect(screen.getByText("Usually about 40 s")).toBeTruthy();
  });

  it("links both transactions when the USDC arrived", () => {
    show(
      {
        kind: "success",
        title: "1.75 USDC arrived",
        note: "at 9xQe...VFin",
        links: [
          { href: "https://basescan.org/tx/0xaaa", label: "View on basescan.org" },
          { href: "https://solscan.io/tx/5sig", label: "View on solscan.io" },
        ],
      },
      { tone: "success", canStartOver: true },
    );
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "https://basescan.org/tx/0xaaa",
      "https://solscan.io/tx/5sig",
    ]);
    expect(links.every((l) => l.getAttribute("target") === "_blank")).toBe(true);
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("lets the user copy the deposit address when Aurora could not finish", () => {
    show(
      {
        kind: "failed",
        title: "Aurora couldn't complete the swap",
        note: "Keep this deposit address…",
        address: ADDRESS,
        support: { href: "https://t.me/auroraisnear", label: "Ask Aurora's support on Telegram" },
      },
      { tone: "danger", canStartOver: true },
    );
    expect(screen.getByRole("button", { name: /copy the deposit address/i })).toBeTruthy();
    const support = screen.getByRole("link", { name: /aurora's support/i });
    expect(support.getAttribute("href")).toBe("https://t.me/auroraisnear");
    expect(support.getAttribute("target")).toBe("_blank");
  });

  it("offers a new address, not starting over, when time ran out", () => {
    const { onNewQuote } = show(
      {
        kind: "expired",
        title: "Time ran out. Nothing was sent",
        note: "No funds moved.",
        address: ADDRESS,
        support: { href: "https://t.me/auroraisnear", label: "Ask Aurora's support on Telegram" },
      },
      { tone: "action", canStartOver: true },
    );
    expect(screen.queryByRole("button", { name: /start over/i })).toBeNull();
    // Para el soporte, si ya se envió después del plazo.
    expect(screen.getByText(ADDRESS)).toBeTruthy();
    expect(screen.getByRole("link", { name: /aurora's support/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /get a new address/i }));

    expect(onNewQuote).toHaveBeenCalledOnce();
  });

  it("closes an unknown address with it, the support link and a way to start over", () => {
    const { onStartOver } = show(
      {
        kind: "unknown",
        title: "This deposit address isn't known to Aurora",
        note: "Don't send to it.",
        address: ADDRESS,
        support: { href: "https://t.me/auroraisnear", label: "Ask Aurora's support on Telegram" },
      },
      { tone: "danger", canStartOver: true },
    );
    expect(screen.getByText("Don't send to it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy the deposit address/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /aurora's support/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("only offers to start over when nothing is on its way", () => {
    const { onStartOver } = show(
      {
        kind: "refunded",
        title: "1.2 USDC returned to you",
        note: "To 0x11...1111 on Base.",
        links: [],
      },
      { tone: "info", canStartOver: true },
    );
    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(onStartOver).toHaveBeenCalledOnce();

    cleanup();
    show({ kind: "send", title: "Send exactly 2", address: ADDRESS }, { canStartOver: false });
    expect(screen.queryByRole("button", { name: /start over/i })).toBeNull();
  });
});
