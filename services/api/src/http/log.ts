import type { Logger } from "../demo/setup-runner";

/**
 * Errors from the RPC client can carry the full URL, and with it the Helius api-key (lesson 20).
 * Every log line goes through here, so a new `String(error)` cannot leak it.
 */
export function redact(text: string): string {
  return text
    .replace(/(https?|wss?):\/\/[^\s"'<>]+/gi, (url) => url.split(/[?#]/)[0] ?? "")
    .replace(/(api[-_]?key|token|secret)=[^\s&"']+/gi, "$1=***");
}

function redactValues(data: object): object {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === "string" ? redact(value) : value,
    ]),
  );
}

export const safeLog: Logger = {
  error: (data, message) => console.error(redact(message), redactValues(data)),
};
