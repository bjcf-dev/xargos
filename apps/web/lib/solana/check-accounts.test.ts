// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  type AccountState,
  checkAgentAccounts,
  MAX_SOL_DROP_LAMPORTS,
  SYSTEM_PROGRAM,
} from "./check-accounts";

const AGENT = "AgentDemo1111111111111111111111111111111111";
const USDC = "AgentUsdcAta1111111111111111111111111111111";
const WSOL = "HmJS62S4Tt5iXffu4CZ2bNUNNXtFy6URjkRbBEUyAYra";
const THIEF = "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const wallet = (lamports: bigint, owner = SYSTEM_PROGRAM): AccountState => ({
  lamports,
  owner,
  data: ["", "base64"],
});
/** Una cuenta de token como la da jsonParsed. */
const token = (amount: string, info: Record<string, unknown> = {}): AccountState => ({
  lamports: 2_039_280n,
  owner: TOKEN,
  data: {
    parsed: {
      type: "account",
      info: { mint: "M", owner: AGENT, state: "initialized", tokenAmount: { amount }, ...info },
    },
    program: "spl-token",
    space: 165n,
  },
});

const before = { [AGENT]: wallet(40_000_000n), [USDC]: token("0"), [WSOL]: token("0") };
const check = (after: Record<string, AccountState | null>, base = before) =>
  checkAgentAccounts({ agent: AGENT, watched: USDC, before: base, after });

describe("checkAgentAccounts", () => {
  it("accepts what the recipe does: USDC in, wSOL closed, a little SOL for fees", () => {
    // El rent de la cuenta de wSOL cerrada vuelve a la wallet; sale la comisión.
    const walletAfter = wallet(40_000_000n + 2_039_280n - 5_000n);
    expect(check({ [AGENT]: walletAfter, [USDC]: token("9950000"), [WSOL]: null })).toBeNull();
  });

  it("accepts a token account the recipe creates for the agent", () => {
    const base = { [AGENT]: wallet(40_000_000n), [USDC]: null };
    expect(check({ [AGENT]: wallet(37_960_720n), [USDC]: token("9950000") }, base)).toBeNull();
  });

  it("refuses SOL leaving the wallet beyond the fee margin", () => {
    const after = { ...before, [AGENT]: wallet(40_000_000n - MAX_SOL_DROP_LAMPORTS - 1n) };
    expect(check(after)).toMatch(/SOL/);
  });

  it("refuses closing an account into someone else's wallet", () => {
    const base = { ...before, [WSOL]: { ...token("0"), lamports: 30_000_000n } };
    expect(check({ ...before, [WSOL]: null }, base)).toMatch(/SOL/);
  });

  it("refuses handing the wallet to another program (System Assign)", () => {
    expect(check({ ...before, [AGENT]: wallet(40_000_000n, THIEF) })).toMatch(/wallet/);
  });

  it("refuses emptying the wallet", () => {
    expect(check({ ...before, [AGENT]: null })).toMatch(/wallet/);
  });

  it("refuses a delegate on a token account (Approve)", () => {
    expect(check({ ...before, [WSOL]: token("0", { delegate: THIEF }) })).toMatch(/spend/);
  });

  it("refuses another owner on a token account (SetAuthority)", () => {
    expect(check({ ...before, [USDC]: token("9950000", { owner: THIEF }) })).toMatch(/control/);
  });

  it("refuses a close authority that is not the agent", () => {
    expect(check({ ...before, [WSOL]: token("0", { closeAuthority: THIEF }) })).toMatch(/close/);
  });

  it("refuses closing the account the guard watches", () => {
    expect(check({ ...before, [USDC]: null })).toMatch(/guard/);
  });

  it("refuses demo USDC leaving the watched account", () => {
    const base = { ...before, [USDC]: token("5000000") };
    expect(check({ ...base, [USDC]: token("4999999") }, base)).toMatch(/USDC/);
  });

  it("refuses a token account moved to another program", () => {
    expect(check({ ...before, [WSOL]: { ...token("0"), owner: THIEF } })).toMatch(/program/);
  });

  it("refuses an account it cannot read after the transaction", () => {
    expect(check({ ...before, [WSOL]: wallet(1n, TOKEN) })).toMatch(/read/);
  });

  it("refuses when the simulation did not return an account", () => {
    expect(check({ [AGENT]: wallet(40_000_000n), [USDC]: token("1") })).toMatch(/read/);
  });
});
