import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { FundAssetsResponse } from "@xargos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { useFundAssets } from "./use-fund-assets";

afterEach(cleanup);

const USDC_SOL = {
  assetId: "nep141:sol-usdc",
  symbol: "USDC",
  blockchain: "sol",
  decimals: 6,
  priceUsd: 1,
};
const ASSETS: FundAssetsResponse = {
  destination: USDC_SOL,
  origins: [{ ...USDC_SOL, assetId: "nep141:base-usdc", blockchain: "base" }],
};

describe("useFundAssets", () => {
  it("loads the origins once", async () => {
    let calls = 0;
    const api = {
      assets: async () => {
        calls++;
        return ASSETS;
      },
    };
    const { result } = renderHook(() => useFundAssets(api));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current).toEqual({ status: "ready", assets: ASSETS }));
    expect(calls).toBe(1);
  });

  it("reports a failure with its code, and tries again on request", async () => {
    let calls = 0;
    const api = {
      assets: async () => {
        calls++;
        if (calls === 1) {
          throw new ApiClientError("FUND_UNAVAILABLE", "Aurora is down", { status: 503 });
        }
        return ASSETS;
      },
    };
    const { result } = renderHook(() => useFundAssets(api));

    await waitFor(() => expect(result.current.status).toBe("error"));
    const failed = result.current;
    if (failed.status !== "error") return;
    expect(failed.error).toMatchObject({ code: "FUND_UNAVAILABLE", message: "Aurora is down" });

    act(() => failed.retry());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(calls).toBe(2);
  });

  it("aborts the request when the screen goes away", async () => {
    let signal: AbortSignal | undefined;
    const api = {
      assets: (options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return new Promise<FundAssetsResponse>(() => {});
      },
    };
    const { unmount } = renderHook(() => useFundAssets(api));
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
