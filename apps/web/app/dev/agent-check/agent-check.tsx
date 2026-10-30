"use client";

import { getAddressFromPublicKey } from "@solana/kit";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AgentKeyStore, openAgentKeyStore } from "@/lib/solana/agent-key-store";
import { isEd25519Supported } from "@/lib/solana/ed25519";
import { getExplorerUrl } from "@/lib/solana/explorer";
import { browserRpc } from "@/lib/solana/rpc";
import { sendTestTransaction } from "./sign-check";

type Check =
  | { status: "loading" }
  | { status: "unsupported" }
  | {
      status: "ready";
      store: AgentKeyStore;
      keyPair: CryptoKeyPair;
      address: string;
      createdAt: number;
    };

type SignResult =
  | { status: "sending" }
  | { status: "landed"; signature: string; failed: boolean }
  | { status: "error"; message: string };

async function loadAgent(store: AgentKeyStore) {
  const agent = (await store.get()) ?? (await store.create());
  return {
    keyPair: agent.keyPair,
    address: await getAddressFromPublicKey(agent.keyPair.publicKey),
    createdAt: agent.createdAt,
  };
}

export function AgentCheck() {
  const [check, setCheck] = useState<Check>({ status: "loading" });
  const [sign, setSign] = useState<SignResult | null>(null);

  useEffect(() => {
    void (async () => {
      if (!(await isEd25519Supported())) return setCheck({ status: "unsupported" });
      const store = await openAgentKeyStore();
      setCheck({ status: "ready", store, ...(await loadAgent(store)) });
    })();
  }, []);

  const newAgent = useCallback(async () => {
    if (check.status !== "ready") return;
    await check.store.clear();
    setSign(null);
    setCheck({ ...check, ...(await loadAgent(check.store)) });
  }, [check]);

  const signCheck = useCallback(async () => {
    if (check.status !== "ready") return;
    setSign({ status: "sending" });
    try {
      const { signature, err } = await sendTestTransaction(
        browserRpc(),
        check.keyPair,
        new AbortController().signal,
      );
      setSign({ status: "landed", signature, failed: err !== null });
    } catch (error) {
      setSign({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [check]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent check</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {check.status === "loading" && <p>Checking this browser…</p>}
        {check.status === "unsupported" && <p>Ed25519: no</p>}
        {check.status === "ready" && (
          <>
            <p>Ed25519: yes</p>
            <p>Storage: {check.store.persistent ? "IndexedDB" : "memory"}</p>
            <p className="font-mono break-all">Agent: {check.address}</p>
            <p>Created: {new Date(check.createdAt).toISOString()}</p>
            <Button className="self-start" onClick={newAgent}>
              New agent
            </Button>
            <Button variant="outline" className="self-start" onClick={signCheck}>
              Send a test transaction
            </Button>
            {sign?.status === "sending" && <p>Sending…</p>}
            {sign?.status === "error" && <p>Error: {sign.message}</p>}
            {sign?.status === "landed" && (
              <>
                <p className="font-mono break-all">
                  {sign.failed ? "Failed" : "Confirmed"}: {sign.signature}
                </p>
                <a className="underline" href={getExplorerUrl(`tx/${sign.signature}`)}>
                  Open in the explorer (devnet)
                </a>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
