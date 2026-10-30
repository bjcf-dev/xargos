import { ERROR_HTTP, type ErrorCode } from "@xargos/shared";

/**
 * La tabla "Pagos fallidos" de docs/api-contract.md, para el jurado. Sin cifras escritas a mano:
 * el status sale de ERROR_HTTP por el código y la ventana del rebuild se nombra (rebuildUntil).
 */
export type FailedPaymentCase = {
  case: string;
  /** El error del contrato que ve el agente; null si no hay respuesta de error (revert on-chain). */
  code: ErrorCode | null;
  response: string;
  charged: string;
};

export const FAILED_PAYMENT_CASES: readonly FailedPaymentCase[] = [
  {
    case: "The agent sends no payment",
    code: "PAYMENT_REQUIRED",
    response:
      "The backend answers with the PAYMENT-REQUIRED header. The agent signs the USDC payment and sends the request again.",
    charged: "No",
  },
  {
    case: "The payment is invalid or too small",
    code: "PAYMENT_INVALID",
    response: "The payment is not verified, so it is not settled.",
    charged: "No",
  },
  {
    case: "The build or its simulation fails (not because of the guard)",
    code: "BUILD_FAILED",
    response: "x402 only settles a payment when the build succeeds, so nothing is taken.",
    charged: "No",
  },
  {
    case: "The transaction expires before it is sent",
    code: "REBUILD_WINDOW_CLOSED",
    response:
      "A free rebuild with the same buildId until rebuildUntil. After that, a new build is a new payment.",
    charged: "Once: the rebuild is free",
  },
  {
    case: "The agent would receive less than the minimum",
    code: null,
    response:
      "The guard's last instruction fails, so the whole transaction reverts on-chain. The demo reads meta.err and the GUARD_FAIL log with getTransaction, and only blames the guard when the guard failed.",
    charged: "The recipe fee and the network fee; the position and funds stay intact",
  },
];

/** "402 PAYMENT_INVALID": status del contrato y código; null si el caso no tiene código. */
export function httpLabel(row: FailedPaymentCase): string | null {
  return row.code === null ? null : `${ERROR_HTTP[row.code].status} ${row.code}`;
}
