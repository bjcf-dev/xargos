import type { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";

type Supported = Awaited<ReturnType<FacilitatorClient["getSupported"]>>;

// x402Facilitator.getSupported() is sync; FacilitatorClient expects a Promise.
export function asFacilitatorClient(facilitator: x402Facilitator): FacilitatorClient {
  return {
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
    getSupported: async () => facilitator.getSupported() as Supported,
  };
}
