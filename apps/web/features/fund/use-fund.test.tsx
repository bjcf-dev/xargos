import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { FundQuote, FundQuoteRequest, FundStatus } from "@xargos/shared";
import { afterEach, describe, expect, it } from "vitest";
import type { FundApi } from "./runner";
import type { DepositStore } from "./storage";
import type { Deposit } from "./types";
import { useFund } from "./use-fund";

// Sin `globals` en Vitest, Testing Library no desmonta los hooks: el desmontaje aborta el polling.
afterEach(cleanup);

const REQUEST: FundQuoteRequest = {
  originAsset: "nep141:base-usdc",
  amount: "2000000",
  recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  refundTo: "0x1111111111111111111111111111111111111111",
  dry: true,
};

const QUOTE: FundQuote = {
  dry: false,
  originAsset: REQUEST.originAsset,
  destinationAsset: "nep141:sol-usdc",
  recipient: REQUEST.recipient,
  refundTo: REQUEST.refundTo,
  amountIn: "2000000",
  amountInFormatted: "2",
  amountInUsd: "2.00",
  amountOut: "1751299",
  amountOutFormatted: "1.751299",
  amountOutUsd: "1.75",
  minAmountOut: "1733786",
  timeEstimateSeconds: 40,
  depositAddress: "0xdeposit",
  deadline: "2099-01-01T00:00:00.000Z",
};

const DEPOSIT: Deposit = {
  depositAddress: "0xdeposit",
  deadline: "2099-01-01T00:00:00.000Z",
  quote: QUOTE,
};

/** Contesta los estados por orden y repite el último: el polling nunca se queda sin respuesta. */
function fakeApi(replies: FundStatus[]) {
  const statusCalls: string[] = [];
  const api: FundApi = {
    async quote(request) {
      if (request.dry) {
        const { depositAddress: _, deadline: __, ...dry } = QUOTE;
        return { ...dry, dry: true };
      }
      return QUOTE;
    },
    async status(address) {
      statusCalls.push(address);
      const status =
        replies.length > 1 ? (replies.shift() as FundStatus) : (replies[0] as FundStatus);
      return { depositAddress: address, status, originTxs: [], destinationTxs: [] };
    },
  };
  return { api, statusCalls };
}

function memoryStore(initial?: Deposit) {
  let saved = initial;
  const store: DepositStore = {
    load: () => saved,
    save: (deposit) => {
      saved = deposit;
    },
    clear: () => {
      saved = undefined;
    },
  };
  return { store, saved: () => saved };
}

describe("useFund", () => {
  it("previews a dry quote", async () => {
    const { api } = fakeApi(["PENDING_DEPOSIT"]);
    const { store } = memoryStore();
    const { result } = renderHook(() => useFund({ api, store, intervalMs: 1 }));

    act(() => result.current.preview(REQUEST));

    await waitFor(() => expect(result.current.state.status).toBe("previewed"));
  });

  it("gets a deposit address, saves it and tracks it until Aurora settles", async () => {
    const { api } = fakeApi(["PENDING_DEPOSIT", "PROCESSING", "SUCCESS"]);
    const memory = memoryStore();
    const { result } = renderHook(() => useFund({ api, store: memory.store, intervalMs: 1 }));

    act(() => result.current.requestDeposit(REQUEST));

    await waitFor(() => expect(result.current.state).toMatchObject({ aurora: "SUCCESS" }));
    expect(result.current.settled).toBe(true);
    expect(memory.saved()).toEqual(DEPOSIT);
  });

  // Un precio en vivo que sale tarde (la pantalla espera a que se deje de teclear) no puede
  // cancelar la petición de la dirección: el botón se quedaría en "Getting the address…".
  it("keeps asking for the deposit address when a late price request comes in", async () => {
    const { api } = fakeApi(["PENDING_DEPOSIT"]);
    const { store } = memoryStore();
    const { result } = renderHook(() => useFund({ api, store, intervalMs: 1 }));

    act(() => {
      result.current.requestDeposit(REQUEST);
      result.current.preview(REQUEST);
    });

    await waitFor(() => expect(result.current.state.status).toBe("tracking"));
  });

  it("picks the saved deposit up again after a reload", async () => {
    const { api, statusCalls } = fakeApi(["PROCESSING", "SUCCESS"]);
    const { store } = memoryStore(DEPOSIT);

    const { result } = renderHook(() => useFund({ api, store, intervalMs: 1 }));

    await waitFor(() => expect(result.current.state).toMatchObject({ aurora: "SUCCESS" }));
    expect(statusCalls[0]).toBe("0xdeposit");
  });

  it("forgets the deposit when starting over after it settled", async () => {
    const { api } = fakeApi(["SUCCESS"]);
    const memory = memoryStore(DEPOSIT);
    const { result } = renderHook(() => useFund({ api, store: memory.store, intervalMs: 1 }));
    await waitFor(() => expect(result.current.settled).toBe(true));

    act(() => result.current.reset());

    expect(result.current.state).toEqual({ status: "idle" });
    expect(memory.saved()).toBeUndefined();
  });

  it("expires when the deadline passed and the last check is still pending", async () => {
    const { api } = fakeApi(["PENDING_DEPOSIT"]);
    const { store } = memoryStore({ ...DEPOSIT, deadline: "2020-01-01T00:00:00.000Z" });

    const { result } = renderHook(() => useFund({ api, store, intervalMs: 1 }));

    await waitFor(() => expect(result.current.state.status).toBe("expired"));
  });

  it("stops polling once unmounted", async () => {
    const { api, statusCalls } = fakeApi(["PENDING_DEPOSIT"]);
    const { store } = memoryStore(DEPOSIT);
    const { unmount } = renderHook(() => useFund({ api, store, intervalMs: 5 }));
    await waitFor(() => expect(statusCalls.length).toBeGreaterThan(0));

    unmount();
    const after = statusCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(statusCalls.length).toBeLessThanOrEqual(after + 1);
  });
});
