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
const POSITION = "FHqPxYZ11kASYCV7LnXvD6RzAnGELDVBUmKudagEzGW3";
const PAY = "AgentPayAta11111111111111111111111111111111";
const THIEF = "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RENT = 2_039_280n;
const MIN_DELTA = 9_900_000n;

const wallet = (lamports: bigint, owner = SYSTEM_PROGRAM): AccountState => ({
  lamports,
  owner,
  data: ["", "base64"],
});
/** Una cuenta de token como la da jsonParsed. */
const token = (amount: string, info: Record<string, unknown> = {}): AccountState => ({
  lamports: RENT,
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

const before: Record<string, AccountState | null> = {
  [AGENT]: wallet(40_000_000n),
  [USDC]: token("0"),
  [WSOL]: token("0"),
  [PAY]: token("50000"),
};
/** Lo que hace la receta: entra USDC demo, se cierra la de wSOL (su rent vuelve), sale la comisión. */
const done: Record<string, AccountState | null> = {
  [AGENT]: wallet(40_000_000n + RENT - 5_000n),
  [USDC]: token("9950000"),
  [WSOL]: null,
  [PAY]: token("50000"),
};
const check = (after: Record<string, AccountState | null>, base = before) =>
  checkAgentAccounts({
    agent: AGENT,
    watched: USDC,
    minDelta: MIN_DELTA,
    payment: PAY,
    before: base,
    after,
  });

describe("checkAgentAccounts", () => {
  it("accepts what the recipe does: USDC in, wSOL closed, a little SOL for fees", () => {
    expect(check(done)).toBeNull();
  });

  it("accepts exactly the demo USDC the guard promises", () => {
    expect(check({ ...done, [USDC]: token(MIN_DELTA.toString()) })).toBeNull();
  });

  it("accepts a token account the recipe creates for the agent", () => {
    const base = { ...before, [USDC]: null };
    const after = { ...done, [AGENT]: wallet(40_000_000n + RENT - 5_000n - RENT) };
    expect(check(after, base)).toBeNull();
  });

  it("refuses less demo USDC than the guard promises", () => {
    const after = { ...done, [USDC]: token((MIN_DELTA - 1n).toString()) };
    expect(check(after)).toMatch(/promise/);
  });

  // Billy, #83: sacar el NFT a otra cuenta y cerrar la de la posición; el rent vuelve y el USDC
  // demo no baja. Lo para que no llegue lo prometido.
  it("refuses a tx that takes the position and pays the agent nothing", () => {
    const base = { ...before, [POSITION]: token("1") };
    const after = { ...before, [AGENT]: wallet(40_000_000n + RENT - 5_000n), [POSITION]: null };
    expect(check(after, base)).toMatch(/promise/);
  });

  it("refuses demo USDC leaving the watched account", () => {
    const base = { ...before, [USDC]: token("5000000") };
    expect(check({ ...done, [USDC]: token("4999999") }, base)).toMatch(/USDC/);
  });

  it("refuses USDC leaving the account the agent pays with", () => {
    expect(check({ ...done, [PAY]: token("49999") })).toMatch(/pays with/);
  });

  it("refuses closing the account the agent pays with", () => {
    expect(check({ ...done, [PAY]: null })).toMatch(/pays with/);
  });

  it("refuses SOL leaving the wallet beyond the fee margin", () => {
    const after = { ...done, [AGENT]: wallet(40_000_000n + RENT - 5_000n - MAX_SOL_DROP_LAMPORTS) };
    expect(check(after)).toMatch(/SOL/);
  });

  it("refuses closing an account into someone else's wallet", () => {
    const base = { ...before, [WSOL]: { ...token("0"), lamports: 30_000_000n } };
    expect(check(done, base)).toMatch(/SOL/);
  });

  it("refuses handing the wallet to another program (System Assign)", () => {
    expect(check({ ...done, [AGENT]: wallet(40_000_000n, THIEF) })).toMatch(/wallet/);
  });

  it("refuses emptying the wallet", () => {
    expect(check({ ...done, [AGENT]: null })).toMatch(/wallet/);
  });

  it("refuses a delegate on a token account (Approve)", () => {
    expect(check({ ...done, [WSOL]: token("0", { delegate: THIEF }) })).toMatch(/spend/);
  });

  it("refuses another owner on a token account (SetAuthority)", () => {
    expect(check({ ...done, [USDC]: token("9950000", { owner: THIEF }) })).toMatch(/control/);
  });

  it("refuses a close authority that is not the agent", () => {
    expect(check({ ...done, [WSOL]: token("0", { closeAuthority: THIEF }) })).toMatch(/close/);
  });

  it("refuses closing the account the guard watches", () => {
    expect(check({ ...done, [USDC]: null })).toMatch(/guard/);
  });

  it("refuses a token account moved to another program", () => {
    expect(check({ ...done, [WSOL]: { ...token("0"), owner: THIEF } })).toMatch(/program/);
  });

  it("refuses an account it cannot read after the transaction", () => {
    expect(check({ ...done, [WSOL]: wallet(1n, TOKEN) })).toMatch(/read/);
  });

  it("refuses when the simulation did not return an account", () => {
    const { [PAY]: _missing, ...rest } = done;
    expect(check(rest)).toMatch(/read/);
  });
});
