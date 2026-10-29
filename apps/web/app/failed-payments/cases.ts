/**
 * La tabla "Pagos fallidos" de docs/api-contract.md, para el jurado. Sin cifras escritas a mano:
 * la ventana del rebuild se nombra (rebuildUntil), no se cifra.
 */
export type FailedPaymentCase = { case: string; response: string; charged: string };

export const FAILED_PAYMENT_CASES: readonly FailedPaymentCase[] = [
  {
    case: "The agent sends no payment",
    response:
      "402 Payment Required with the PAYMENT-REQUIRED header. The agent signs the USDC payment and sends the request again.",
    charged: "No",
  },
  {
    case: "The payment is invalid or too small",
    response: "402 with PAYMENT_INVALID. The payment is not settled.",
    charged: "No",
  },
  {
    case: "The build or its simulation fails (not because of the guard)",
    response:
      "500 with BUILD_FAILED. x402 only settles a payment when the build succeeds, so nothing is taken.",
    charged: "No",
  },
  {
    case: "The transaction expires before it is sent",
    response:
      "A free rebuild with the same buildId until rebuildUntil. After that, REBUILD_WINDOW_CLOSED: a new build is a new payment.",
    charged: "Once: the rebuild is free",
  },
  {
    case: "The agent would receive less than the minimum",
    response:
      "The guard's last instruction fails, so the whole transaction reverts on-chain. The demo reads meta.err and the GUARD_FAIL log with getTransaction, and only blames the guard when the guard failed.",
    charged: "The recipe fee and the network fee; the position and funds stay intact",
  },
];
