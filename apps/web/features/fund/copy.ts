import type { FundError } from "./types";

/** Une las partes que existen con un espacio: "2" + "USDC" + undefined → "2 USDC". */
const words = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");

/**
 * Textos de /fund (en inglés, como la demo). Sin nombres de estado de Aurora ni jerga: el usuario
 * ve sus propios pasos (How much, Send, On its way), nunca los de Aurora.
 */
export const FUND_COPY = {
  mainnet: {
    title: "Real funds on mainnet",
    line: "Funding moves real money on mainnet. Recipes, the guard and x402 stay on devnet.",
  },
  form: {
    originAsset: "Choose what you send.",
    amount: "Enter an amount, like 2 or 2.5.",
    recipient: "This isn't a Solana address.",
    refundTo: "Use an address that starts with 0x and has 40 more characters.",
    notTheAgent: "Use your own wallet, not the demo agent's key.",
    firstTimeCosts:
      "The first funding to a new address costs a bit more: a USDC account is created for it.",
    refundHint: "The wallet you'll send from.",
  },
  line: {
    quote: (amount: string, symbol?: string, network?: string, out?: string) =>
      `${words(amount, symbol, network && `from ${network}`)} → ≈ ${out} USDC on Solana`,
    received: (amount: string, symbol?: string) => `${words(amount, symbol)} received`,
    seen: (network?: string) => words("Deposit seen", network && `on ${network}`),
    expired: (address: string) => `Deposit address ${address} expired`,
    upcoming: (recipient: string) => `Arrives at ${recipient}`,
  },
  now: {
    send: (amount: string, symbol?: string, network?: string) =>
      words("Send exactly", amount, symbol, network && `on ${network}`),
    incomplete: (missing?: string, symbol?: string) =>
      missing ? words("Send", missing, symbol, "more") : "Send the rest",
    incompleteNote: (received: string | undefined, symbol: string | undefined, refundTo: string) =>
      `To the same address, before the time runs out. If the rest doesn't arrive, ${
        received ? words("the", received, symbol) : "what you sent"
      } goes back to ${refundTo} automatically.`,
    seen: "Deposit seen",
    swapping: "Swapping to USDC…",
    estimate: (seconds: number) => `Usually about ${seconds} s`,
    success: (amount?: string) => (amount ? `${amount} USDC arrived` : "Your USDC arrived"),
    successNote: (recipient: string) => `at ${recipient}`,
    refunded: (amount?: string, symbol?: string) =>
      amount ? `${words(amount, symbol)} returned to you` : "Your funds were returned to you",
    refundedNote: (refundTo: string, network?: string, reason?: string) =>
      `To ${words(refundTo, network && `on ${network}`)}.${reason ? ` Reason: ${reason}.` : ""}`,
    failed: "Aurora couldn't complete the swap",
    failedNote: "Keep this deposit address: Aurora's support needs it to find your funds.",
    expired: "Time ran out. Nothing was sent",
    expiredNote: (refundTo: string) =>
      `No funds moved. Don't send to this address anymore. If you already sent, it comes back to ${refundTo} automatically.`,
    retrying: "Can't reach Aurora right now, retrying…",
    checking: "Checking your deposit…",
    timeUp: "Time's up. Don't send to this address anymore.",
    timeUpIncomplete:
      "Time's up. Don't send more to this address: what arrived goes back to you automatically.",
  },
} as const;

/** Qué enseñar cuando falla una llamada de /fund: título corto y qué hacer. */
export function fundErrorText(error: FundError): { title: string; hint: string } {
  switch (error.code) {
    case "FUND_QUOTE_FAILED":
      return {
        title: "Aurora can't quote this",
        hint: `${error.message}. Change the amount or the addresses.`,
      };
    case "FUND_UNAVAILABLE":
      return { title: "Aurora isn't answering right now", hint: "Try again in a moment." };
    case "RATE_LIMITED":
      return {
        title: "Too many requests",
        hint:
          error.retryAfterSeconds !== undefined
            ? `Try again in ${error.retryAfterSeconds} s.`
            : "Try again in a moment.",
      };
    default:
      return { title: "Can't reach xARGOS", hint: "Check your connection and try again." };
  }
}
