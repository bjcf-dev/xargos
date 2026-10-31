// @vitest-environment node
import {
  address,
  generateKeyPair,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase58Decoder,
} from "@solana/kit";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { createPayingFetch, DEVNET_NETWORK, paymentPolicy } from "./payer";

const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const PAY_TO = "D1PzuAbRJB1io3awJX2GDoiL1ihwK9Kt9yfciLrgJFss";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RPC_URL = "http://web.local/api/xargos/rpc";
const BUILD_URL = "http://web.local/api/xargos/recipes/r1/build";
const limit = { mint: MINT, maxAmount: "10000" };

const requirement = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: "exact",
  network: DEVNET_NETWORK,
  asset: MINT,
  amount: "10000",
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  extra: { feePayer: PAY_TO },
  ...over,
});

/** Un 402 de x402 v2 con estas opciones de pago. */
function paymentRequired(accepts: PaymentRequirements[]): Response {
  const header = encodePaymentRequiredHeader({
    x402Version: 2,
    resource: { url: BUILD_URL, description: "recipe", mimeType: "application/json" },
    accepts,
  });
  return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": header } });
}

/** Cuenta de mint SPL (82 bytes): sin autoridades, 6 decimales, inicializada. */
function mintAccountBase64(): string {
  const data = new Uint8Array(82);
  data[44] = 6;
  data[45] = 1;
  return Buffer.from(data).toString("base64");
}

/** El RPC de /api/xargos/rpc: el mint del pago y un blockhash. Guarda los métodos pedidos. */
const rpcMethods: string[] = [];
function stubRpc() {
  const blockhash = getBase58Decoder().decode(new Uint8Array(32).fill(7));
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== RPC_URL) throw new Error(`unexpected fetch ${String(input)}`);
    const { id, method } = JSON.parse(String(init?.body)) as { id: number; method: string };
    rpcMethods.push(method);
    const value =
      method === "getAccountInfo"
        ? {
            data: [mintAccountBase64(), "base64"],
            executable: false,
            lamports: 1_461_600,
            owner: TOKEN_PROGRAM,
            rentEpoch: 0,
            space: 82,
          }
        : { blockhash, lastValidBlockHeight: 100 };
    return Response.json({ jsonrpc: "2.0", id, result: { context: { slot: 1 }, value } });
  });
}

/** El fetch hacia el backend: responde por orden y guarda cada petición. */
function backend(...responses: Response[]) {
  const calls: Headers[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Headers(input instanceof Request ? input.headers : init?.headers));
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next;
  };
  return { fetch, calls };
}

let keyPair: CryptoKeyPair;
let agent: string;
beforeAll(async () => {
  keyPair = await generateKeyPair();
  agent = await getAddressFromPublicKey(keyPair.publicKey);
});
afterEach(() => {
  vi.unstubAllGlobals();
  rpcMethods.length = 0;
});

const post = { method: "POST", body: JSON.stringify({ agent: "A", position: "P" }) };

describe("paymentPolicy", () => {
  const keep = paymentPolicy(limit);

  it("keeps an exact payment on devnet in the recipe mint, up to its price", () => {
    expect(keep(2, [requirement(), requirement({ amount: "9999" })])).toHaveLength(2);
  });

  it.each([
    ["more than the recipe price", { amount: "10001" }],
    ["another mint", { asset: PAY_TO }],
    ["another network", { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const }],
    ["another scheme", { scheme: "upto" }],
    ["an amount that is not a number", { amount: "1e3" }],
  ])("drops %s", (_name, over) => {
    expect(keep(2, [requirement(over as Partial<PaymentRequirements>)])).toEqual([]);
  });
});

describe("createPayingFetch", () => {
  it("passes a response that asks for no payment through, without paying", async () => {
    const { fetch, calls } = backend(Response.json({ ok: true }));
    const paying = createPayingFetch({ keyPair, rpcUrl: RPC_URL, limit, fetch });

    const response = await paying(BUILD_URL, post);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.get("PAYMENT-SIGNATURE")).toBeNull();
  });

  it("pays a 402 within the limit once, signed by the agent", async () => {
    stubRpc();
    const { fetch, calls } = backend(paymentRequired([requirement()]), Response.json({}));
    const paying = createPayingFetch({ keyPair, rpcUrl: RPC_URL, limit, fetch });

    const response = await paying(BUILD_URL, post);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    const header = calls[1]?.get("PAYMENT-SIGNATURE");
    expect(header).toBeTruthy();
    const payload = decodePaymentSignatureHeader(header ?? "");
    expect(payload.accepted).toMatchObject({ asset: MINT, amount: "10000", payTo: PAY_TO });
    // La tx del pago va firmada por el agente: su dirección está en la tx.
    const tx = Buffer.from((payload.payload as { transaction: string }).transaction, "base64");
    expect(tx.includes(Buffer.from(getAddressEncoder().encode(address(agent))))).toBe(true);
    // Lee el mint por la ruta RPC del front, nunca por un RPC público.
    expect(rpcMethods).toContain("getAccountInfo");
  });

  it("refuses a 402 beyond the limit: rejected, nothing paid, with the reason", async () => {
    stubRpc();
    const { fetch, calls } = backend(paymentRequired([requirement({ amount: "10001" })]));
    const paying = createPayingFetch({ keyPair, rpcUrl: RPC_URL, limit, fetch });

    const error = await paying(BUILD_URL, post).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ rejected: true });
    expect((error as Error).message).toMatch(/^The agent refused to pay/);
    expect(calls).toHaveLength(1);
  });

  it("leaves network errors to the api client (it may have paid)", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const paying = createPayingFetch({ keyPair, rpcUrl: RPC_URL, limit, fetch });

    await expect(paying(BUILD_URL, post)).rejects.toBeInstanceOf(TypeError);
  });
});
