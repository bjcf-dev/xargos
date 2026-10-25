import type { DemoError, DemoEvent, DemoState } from "./types";
import { initialDemoState } from "./types";

/** Estados con una llamada en vuelo: solo ahí tiene sentido un FAILED. */
const IN_FLIGHT = new Set<DemoState["status"]>([
  "setup",
  "paying",
  "shocking",
  "signing",
  "rebuilding",
]);

function agentOf(state: DemoState): string | undefined {
  if ("agent" in state) return state.agent;
  if ("run" in state) return state.run.agent;
  return undefined;
}

function toError(state: DemoState, error: DemoError): DemoState {
  const agent = agentOf(state);
  return {
    status: "error",
    error: { code: error.code, message: error.message },
    failedAt: state.status,
    ...(agent ? { agent } : {}),
  };
}

/**
 * Reducer puro de la demo. Un evento que no aplica al estado actual devuelve el
 * MISMO objeto: respuestas tardías, dobles clics y polls de otro agente se ignoran.
 */
export function demoReducer(state: DemoState, event: DemoEvent): DemoState {
  switch (event.type) {
    case "SETUP_STARTED":
      if (state.status !== "idle" && state.status !== "error") return state;
      return {
        status: "setup",
        agent: event.agent,
        setup: { agent: event.agent, phase: "queued" },
      };

    case "SETUP_PROGRESS": {
      if (state.status !== "setup" || event.setup.agent !== state.agent) return state;
      if (event.setup.phase === "failed") {
        return toError(
          state,
          event.setup.error ?? { code: "SETUP_FAILED", message: "Demo setup failed" },
        );
      }
      return { ...state, setup: event.setup };
    }

    case "PAY":
      if (state.status !== "setup" || state.setup.phase !== "ready" || !state.setup.position) {
        return state;
      }
      return { status: "paying", agent: state.agent, position: state.setup.position };

    case "BUILT":
      // Rebuild gratis (D19): tx nueva, mismo recibo del primer pago.
      if (state.status === "rebuilding") {
        return { status: "built", run: { ...state.run, build: event.build } };
      }
      if (state.status !== "paying") return state;
      return {
        status: "built",
        run: {
          agent: state.agent,
          position: state.position,
          build: event.build,
          ...(event.paymentResponse ? { paymentResponse: event.paymentResponse } : {}),
        },
      };

    case "SHOCK_STARTED":
      // Un solo shock por build: el segundo no tiene sentido en la demo B.
      if (state.status !== "built" || state.shock) return state;
      return { status: "shocking", run: state.run, shockId: event.shockId };

    case "SHOCK_SETTLED": {
      if (state.status !== "shocking" || event.shock.shockId !== state.shockId) return state;
      if (event.shock.status === "pending") return state;
      if (event.shock.status === "failed") {
        return toError(
          state,
          event.shock.error ?? { code: "SHOCK_FAILED", message: "Price shock failed" },
        );
      }
      return { status: "built", run: state.run, shock: event.shock };
    }

    case "SIGN":
      if (state.status !== "built") return state;
      return {
        status: "signing",
        run: state.run,
        ...(state.shock ? { shock: state.shock } : {}),
      };

    case "CONFIRMED":
      if (state.status !== "signing") return state;
      return { status: "confirmed", run: state.run, signature: event.signature };

    case "REVERTED":
      if (state.status !== "signing") return state;
      return {
        status: "reverted",
        run: state.run,
        signature: event.signature,
        failure: event.failure,
      };

    case "EXPIRED":
      // El blockhash caduca antes de enviar: desde built o mientras se firma.
      if (state.status !== "built" && state.status !== "signing") return state;
      return { status: "expired", run: state.run };

    case "REBUILD":
      if (state.status !== "expired") return state;
      if (event.now >= Date.parse(state.run.build.rebuildUntil)) {
        return toError(state, { code: "REBUILD_WINDOW_CLOSED", message: "Rebuild window closed" });
      }
      return { status: "rebuilding", run: state.run };

    case "FAILED":
      return IN_FLIGHT.has(state.status) ? toError(state, event.error) : state;

    case "RESET":
      return initialDemoState;

    default:
      return state;
  }
}
