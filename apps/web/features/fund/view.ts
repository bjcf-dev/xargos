import type { FundAsset, FundStatusResponse, FundTx } from "@xargos/shared";
import { formatUnits } from "@/lib/format";
import { ellipsify } from "@/lib/solana/explorer";
import { FUND_COPY } from "./copy";
import { formatWhen } from "./countdown";
import { isSettled } from "./reducer";
import type { Deposit, FundState } from "./types";

export type FundLink = { href: string; label: string };
/** Un paso ya cerrado, en una línea. */
export type FundLine = { text: string; link?: FundLink; faded?: true };
/** progress: en marcha; action: hay que hacer algo; info: solo informa; danger: no sabemos. */
export type FundTone = "progress" | "action" | "success" | "info" | "danger";

/** El bloque grande, el único paso abierto. */
export type FundNow =
  | { kind: "form" }
  /** Recién recargado: aún no se sabe si ya llegó algo, así que no se pide enviar nada. */
  | { kind: "checking"; title: string }
  | { kind: "send"; title: string; address: string; memo?: string; neverAfter?: string }
  | {
      kind: "incomplete";
      title: string;
      note: string;
      address: string;
      memo?: string;
      neverAfter?: string;
    }
  | { kind: "arriving"; title: string; stage: 1 | 2; estimate?: string }
  | { kind: "success" | "refunded"; title: string; note: string; links: FundLink[] }
  /** failed: Aurora no terminó. unknown: Aurora no conoce la dirección (NOT_FOUND, #136). */
  | { kind: "failed" | "unknown"; title: string; note: string; address: string; support: FundLink }
  | { kind: "expired"; title: string; note: string; address: string; support: FundLink };

export type FundView = {
  done: FundLine[];
  now: FundNow;
  tone: FundTone;
  /** Lo que aún no ha pasado, atenuado al final. */
  upcoming?: string;
  /** La última consulta falló: se reintenta sola. */
  retrying: boolean;
  /** Ya no hay dinero de camino: se puede empezar de nuevo. */
  canStartOver: boolean;
};

const NETWORKS: Record<string, string> = { base: "Base", arb: "Arbitrum", eth: "Ethereum" };

/** El slug de Aurora → el nombre que conoce cualquiera. */
export function networkName(blockchain: string): string {
  return NETWORKS[blockchain] ?? blockchain.charAt(0).toUpperCase() + blockchain.slice(1);
}

/** "View on basescan.org": el nombre sale del enlace, sin tabla de exploradores. */
export function explorerLabel(url: string): string {
  return `View on ${new URL(url).hostname.replace(/^www\./, "")}`;
}

/** Lo que falta por enviar, exacto en unidades base; undefined si no se puede saber. */
export function missingAmount(
  latest: FundStatusResponse | undefined,
  decimals: number | undefined,
): string | undefined {
  if (!latest?.amountIn || !latest.depositedAmount || decimals === undefined) return undefined;
  const missing = BigInt(latest.amountIn) - BigInt(latest.depositedAmount);
  return missing > 0n ? formatUnits(missing, decimals) : undefined;
}

const link = (tx: FundTx): FundLink => ({
  href: tx.explorerUrl,
  label: explorerLabel(tx.explorerUrl),
});
const memoOf = (deposit: Deposit) => (deposit.depositMemo ? { memo: deposit.depositMemo } : {});
/** Until when Aurora watches the address ("12:30", or "11 Nov, 12:30" if not today), if it said. */
const inactiveAt = (deposit: Deposit) =>
  deposit.timeWhenInactive ? formatWhen(deposit.timeWhenInactive) : undefined;
const neverAfterOf = (deposit: Deposit) => {
  const until = inactiveAt(deposit);
  return until ? { neverAfter: FUND_COPY.now.neverAfter(until) } : {};
};

/** De la máquina de F14 a lo que enseña la página: pasos cerrados arriba y el paso abierto. */
export function fundView(state: FundState, origins: FundAsset[] | undefined): FundView {
  if (state.status !== "tracking" && state.status !== "expired" && state.status !== "unknown") {
    return {
      done: [],
      now: { kind: "form" },
      tone: "progress",
      retrying: false,
      canStartOver: false,
    };
  }

  const { deposit } = state;
  const { quote } = deposit;
  const asset = origins?.find((o) => o.assetId === quote.originAsset);
  const symbol = asset?.symbol;
  const network = asset ? networkName(asset.blockchain) : undefined;
  const refundTo = ellipsify(quote.refundTo);
  const done: FundLine[] = [
    {
      text: FUND_COPY.line.quote(
        quote.amountInFormatted,
        symbol,
        network,
        quote.amountOutFormatted,
      ),
    },
  ];

  if (state.status === "expired") {
    done.push({ text: FUND_COPY.line.expired(ellipsify(deposit.depositAddress)), faded: true });
    return {
      done,
      now: {
        kind: "expired",
        title: FUND_COPY.now.expired,
        note: FUND_COPY.now.expiredNote(refundTo, inactiveAt(deposit)),
        address: deposit.depositAddress,
        support: { ...FUND_COPY.now.support },
      },
      tone: "action",
      retrying: false,
      canStartOver: true,
    };
  }

  if (state.status === "unknown") {
    return {
      done,
      now: {
        kind: "unknown",
        title: FUND_COPY.now.unknown,
        note: FUND_COPY.now.unknownNote,
        address: deposit.depositAddress,
        support: { ...FUND_COPY.now.support },
      },
      tone: "danger",
      retrying: false,
      canStartOver: true,
    };
  }

  const latest = state.latest;
  const aurora = state.aurora;
  const base = {
    retrying: state.lastError !== undefined,
    canStartOver: isSettled(state),
    ...(isSettled(state) ? {} : { upcoming: FUND_COPY.line.upcoming(ellipsify(quote.recipient)) }),
  };

  if (aurora === undefined) {
    return {
      ...base,
      done,
      now: { kind: "checking", title: FUND_COPY.now.checking },
      tone: "progress",
    };
  }

  if (aurora === "PENDING_DEPOSIT") {
    return {
      ...base,
      done,
      now: {
        kind: "send",
        title: FUND_COPY.now.send(quote.amountInFormatted, symbol, network),
        address: deposit.depositAddress,
        ...memoOf(deposit),
        ...neverAfterOf(deposit),
      },
      tone: "progress",
    };
  }

  const firstOrigin = latest?.originTxs[0];
  done.push(
    latest?.depositedAmountFormatted
      ? { text: FUND_COPY.line.received(latest.depositedAmountFormatted, symbol) }
      : { text: FUND_COPY.line.seen(network), ...(firstOrigin ? { link: link(firstOrigin) } : {}) },
  );

  switch (aurora) {
    case "KNOWN_DEPOSIT_TX":
    case "PROCESSING":
      return {
        ...base,
        done,
        now: {
          kind: "arriving",
          title: aurora === "PROCESSING" ? FUND_COPY.now.swapping : FUND_COPY.now.seen,
          stage: aurora === "PROCESSING" ? 2 : 1,
          estimate: FUND_COPY.now.estimate(quote.timeEstimateSeconds),
        },
        tone: "progress",
      };
    case "INCOMPLETE_DEPOSIT":
      return {
        ...base,
        done,
        now: {
          kind: "incomplete",
          title: FUND_COPY.now.incomplete(missingAmount(latest, asset?.decimals), symbol),
          note: FUND_COPY.now.incompleteNote(latest?.depositedAmountFormatted, symbol, refundTo),
          address: deposit.depositAddress,
          ...memoOf(deposit),
          ...neverAfterOf(deposit),
        },
        tone: "action",
      };
    case "SUCCESS":
      return {
        ...base,
        done,
        now: {
          kind: "success",
          title: FUND_COPY.now.success(latest?.amountOutFormatted),
          note: FUND_COPY.now.successNote(ellipsify(quote.recipient)),
          links: [...(latest?.originTxs ?? []), ...(latest?.destinationTxs ?? [])].map(link),
        },
        tone: "success",
      };
    case "REFUNDED":
      return {
        ...base,
        done,
        now: {
          kind: "refunded",
          title: FUND_COPY.now.refunded(latest?.refundedAmountFormatted, symbol),
          note: FUND_COPY.now.refundedNote(refundTo, network, latest?.refundReason),
          links: (latest?.originTxs ?? []).map(link),
        },
        tone: "info",
      };
    case "FAILED":
      return {
        ...base,
        done,
        now: {
          kind: "failed",
          title: FUND_COPY.now.failed,
          note: FUND_COPY.now.failedNote,
          address: deposit.depositAddress,
          support: { ...FUND_COPY.now.support },
        },
        tone: "danger",
      };
  }
}
