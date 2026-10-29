"use client";

import { getAddressFromPublicKey } from "@solana/kit";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AgentKeyStore, openAgentKeyStore } from "@/lib/solana/agent-key-store";
import { isEd25519Supported } from "@/lib/solana/ed25519";

type Check =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "ready"; store: AgentKeyStore; address: string; createdAt: number };

async function loadAgent(store: AgentKeyStore) {
  const agent = (await store.get()) ?? (await store.create());
  return {
    address: await getAddressFromPublicKey(agent.keyPair.publicKey),
    createdAt: agent.createdAt,
  };
}

export function AgentCheck() {
  const [check, setCheck] = useState<Check>({ status: "loading" });

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
    setCheck({ ...check, ...(await loadAgent(check.store)) });
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
