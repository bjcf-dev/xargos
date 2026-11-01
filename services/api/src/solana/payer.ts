import { readFileSync } from "node:fs";
import type { Config } from "../config";

/** The payer secret key as bytes, from PAYER_KEYPAIR (hosted) or from the file at PAYER_KEYPAIR_PATH. */
export function readPayerBytes(
  config: Pick<Config, "PAYER_KEYPAIR" | "PAYER_KEYPAIR_PATH">,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): Uint8Array {
  const raw =
    config.PAYER_KEYPAIR ?? (config.PAYER_KEYPAIR_PATH && readFile(config.PAYER_KEYPAIR_PATH));
  if (!raw) throw new Error("Set PAYER_KEYPAIR_PATH or PAYER_KEYPAIR");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never echo the content: it is a private key.
    throw new Error("The payer keypair is not valid JSON");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    parsed.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    throw new Error("The payer keypair must be a JSON array of 64 bytes");
  }
  return Uint8Array.from(parsed);
}
