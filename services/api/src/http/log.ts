import type { Logger } from "../demo/setup-runner";

const MAX_DEPTH = 5;

/**
 * Errors from the RPC client can carry the full URL, and with it the Helius api-key (lesson 20).
 * Every log line goes through here, so a new `String(error)` cannot leak it.
 */
export function redact(text: string): string {
  return text
    .replace(/(https?|wss?):\/\/[^\s"'<>]+/gi, (url) => url.split(/[?#]/)[0] ?? "")
    .replace(/(api[-_]?key|token|secret)=[^\s&"']+/gi, "$1=***");
}

/** Goes down objects, arrays and Errors, so logging one by mistake cannot leak a key either. */
function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redact(value);
  if (value instanceof Error) return redact(String(value));
  if (typeof value !== "object" || value === null || depth >= MAX_DEPTH) {
    return typeof value === "object" && value !== null ? "[object]" : value;
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactDeep(item, depth + 1)]),
  );
}

export const safeLog: Logger = {
  error: (data, message) => console.error(redact(message), redactDeep(data)),
};
