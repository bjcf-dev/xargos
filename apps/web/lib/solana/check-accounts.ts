/** Lo que importa de una cuenta, tal como la dan getMultipleAccounts y la simulación (jsonParsed). */
export type AccountState = { lamports: bigint; owner: string; data: unknown };

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/**
 * Cuánto SOL pueden perder entre todas las cuentas del agente: la comisión de red y el pequeño
 * desvío entre la cotización y la simulación (la receta paga el swap con el SOL que devuelve la
 * posición). Se suman todas porque el rent de una cuenta nueva o cerrada sigue siendo del agente.
 * Margen provisional: falta medirlo con la simulación de una demo A real en devnet.
 */
export const MAX_SOL_DROP_LAMPORTS = 2_000_000n;

type TokenInfo = { owner?: string; delegate?: string; closeAuthority?: string; amount?: string };

function tokenInfo(state: AccountState): TokenInfo | null {
  const { data } = state;
  if (typeof data !== "object" || data === null || !("parsed" in data)) return null;
  const parsed = (data as { parsed: { type?: string; info?: Record<string, unknown> } }).parsed;
  if (parsed?.type !== "account" || !parsed.info) return null;
  const { owner, delegate, closeAuthority, tokenAmount } = parsed.info as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    owner: text(owner),
    delegate: text(delegate),
    closeAuthority: text(closeAuthority),
    amount: text((tokenAmount as { amount?: unknown } | undefined)?.amount),
  };
}

/**
 * Compara las cuentas del agente antes y después de simular la tx. El guard solo vigila el USDC
 * demo: esto para lo que el guard no ve, como dar el control de una cuenta (Assign, Approve,
 * SetAuthority, que no mueven saldo) o sacar SOL de la wallet. Devuelve qué haría la tx, para
 * "The transaction would …", o null si solo hace lo que la receta necesita.
 */
export function checkAgentAccounts({
  agent,
  watched,
  before,
  after,
}: {
  agent: string;
  /** La cuenta de USDC demo que vigila el guard (build.guard.watchedAccount). */
  watched: string;
  before: Readonly<Record<string, AccountState | null>>;
  after: Readonly<Record<string, AccountState | null>>;
}): string | null {
  for (const address of Object.keys(before)) {
    if (!(address in after)) return `leave ${address} in a state the demo could not read`;
    const was = before[address] ?? null;
    const now = after[address] ?? null;

    if (address === agent) {
      if (!now || now.lamports === 0n) return "empty the agent's wallet";
      if (now.owner !== SYSTEM_PROGRAM) return "hand the agent's wallet to another program";
      continue;
    }

    if (!now) {
      if (address === watched) return "close the account the guard watches";
      continue; // la receta cierra la cuenta de wSOL y la de la posición
    }
    if (was && now.owner !== was.owner) return `move ${address} to another program`;
    const info = tokenInfo(now);
    if (!info) return `leave ${address} in a state the demo could not read`;
    if (info.owner !== agent) return `give another wallet control of ${address}`;
    if (info.delegate !== undefined) return `let another wallet spend from ${address}`;
    if (info.closeAuthority !== undefined && info.closeAuthority !== agent) {
      return `let another wallet close ${address}`;
    }
    if (address === watched && was) {
      const previous = tokenInfo(was)?.amount;
      if (previous !== undefined && BigInt(info.amount ?? "0") < BigInt(previous)) {
        return "take demo USDC from the agent";
      }
    }
  }
  const total = (states: Readonly<Record<string, AccountState | null>>) =>
    Object.keys(before).reduce((sum, address) => sum + (states[address]?.lamports ?? 0n), 0n);
  if (total(before) - total(after) > MAX_SOL_DROP_LAMPORTS) return "take SOL from the agent";
  return null;
}
