#!/usr/bin/env node
// Genera claves desechables de devnet para xARGOS en ~/.config/xargos/ (formato Solana: 64 bytes).
// Solo imprime direcciones públicas. Nunca sobrescribe una clave existente.
// Uso: node scripts/gen-devnet-keys.mjs [nombre ...]   (por defecto: agent facilitator payto)
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

const dir = join(homedir(), ".config", "xargos");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const names = process.argv.slice(2);
if (names.length === 0) names.push("agent", "facilitator", "payto");

for (const name of names) {
  const file = join(dir, `${name}-keypair.json`);
  if (existsSync(file)) {
    console.log(`${name}: ya existe, no se toca (${file})`);
    continue;
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const secret = Buffer.from(jwk.d, "base64url");
  const pub = Buffer.from(jwk.x, "base64url");
  writeFileSync(file, JSON.stringify([...Buffer.concat([secret, pub])]), { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`${name}: ${base58(pub)}  (${file})`);
}
