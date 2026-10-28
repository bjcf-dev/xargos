import {
  openPositionInstructions,
  setNativeMintWrappingStrategy,
  WhirlpoolDeployment,
} from "@orca-so/whirlpools";
import {
  type Address,
  address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { findSnapshotStatePda, getInitSnapshotInstruction } from "@xargos/guard-client";
import type { SendInstructions } from "../solana/send";
import type { SetupSteps } from "./setup-runner";

const TOKEN_2022_PROGRAM = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export type SetupStepsDeps = {
  rpc: Rpc<SolanaRpcApi>;
  send: SendInstructions;
  payer: KeyPairSigner;
  /** Circle's devnet USDC: what the agent pays x402 with. */
  circleUsdc: Address;
  /** The demo USDC of the pool (ADR 0003). */
  demoUsdc: Address;
  whirlpool: Address;
  guardProgram: Address;
  fundSolLamports: bigint;
  /** 0 skips the transfer (useful before the treasury has USDC); accounts are still created. */
  fundUsdcBase: bigint;
  positionSolLamports: bigint;
};

const ata = (owner: Address, mint: Address, tokenProgram: Address = TOKEN_PROGRAM_ADDRESS) =>
  findAssociatedTokenPda({ owner, mint, tokenProgram }).then(([a]) => a);

const range = { lower: 100, upper: 250 };

/** The on-chain side of /demo/setup. Everything is paid by the backend payer; the agent never signs. */
export function createSetupSteps(d: SetupStepsDeps): SetupSteps {
  const createAta = async (
    owner: Address,
    mint: Address,
    tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
  ) =>
    getCreateAssociatedTokenIdempotentInstruction({
      payer: d.payer,
      ata: await ata(owner, mint, tokenProgram),
      owner,
      mint,
      tokenProgram,
    });

  return {
    async fundSol(agent) {
      await d.send([
        getTransferSolInstruction({
          source: d.payer,
          destination: address(agent),
          amount: d.fundSolLamports,
        }),
      ]);
    },

    async fundUsdc(agent) {
      const owner = address(agent);
      const instructions: Instruction[] = [
        await createAta(owner, d.circleUsdc),
        await createAta(owner, d.demoUsdc),
      ];
      if (d.fundUsdcBase > 0n) {
        instructions.push(
          getTransferCheckedInstruction({
            source: await ata(d.payer.address, d.circleUsdc),
            mint: d.circleUsdc,
            destination: await ata(owner, d.circleUsdc),
            authority: d.payer,
            amount: d.fundUsdcBase,
            decimals: 6,
          }),
        );
      }
      await d.send(instructions);
    },

    async openPosition(agent) {
      // The SDK would otherwise wrap SOL with throwaway keypairs; the payer's wSOL ATA is simpler.
      setNativeMintWrappingStrategy("ata");
      const owner = address(agent);
      const { instructions, positionMint } = await openPositionInstructions(
        d.rpc,
        d.whirlpool,
        {
          tokenMaxA: d.positionSolLamports,
          tokenMaxB: (d.positionSolLamports * 300_000_000n) / 1_000_000_000n,
        },
        range.lower,
        range.upper,
        { funder: d.payer, whirlpoolDeployment: WhirlpoolDeployment.devnet },
      );
      await d.send(instructions);

      // The position NFT is a Token-2022 mint with 0 decimals: hand it to the agent.
      await d.send([
        await createAta(owner, positionMint, TOKEN_2022_PROGRAM),
        getTransferCheckedInstruction(
          {
            source: await ata(d.payer.address, positionMint, TOKEN_2022_PROGRAM),
            mint: positionMint,
            destination: await ata(owner, positionMint, TOKEN_2022_PROGRAM),
            authority: d.payer,
            amount: 1n,
            decimals: 0,
          },
          { programAddress: TOKEN_2022_PROGRAM },
        ),
      ]);
      return { position: positionMint };
    },

    async initSnapshot(agent) {
      const owner = address(agent);
      const config = { programAddress: d.guardProgram };
      const [snapshot] = await findSnapshotStatePda({ agent: owner, mint: d.demoUsdc }, config);
      await d.send([
        getInitSnapshotInstruction(
          { payer: d.payer, agent: owner, mint: d.demoUsdc, snapshot },
          config,
        ),
      ]);
    },

    async balances(agent) {
      const owner = address(agent);
      const sol = await d.rpc.getBalance(owner).send();
      const usdc = await d.rpc
        .getTokenAccountBalance(await ata(owner, d.circleUsdc))
        .send()
        .catch(() => null);
      return { sol: sol.value.toString(), usdc: usdc?.value.amount ?? "0" };
    },
  };
}
