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

/** Agente y posición del estado actual, si los hay: el error los guarda para reintentar. */
function contextOf(state: DemoState): { agent?: string; position?: string } {
  if ("run" in state) return { agent: state.run.agent, position: state.run.position };
  if (state.status === "paying") return { agent: state.agent, position: state.position };
  if (state.status === "setup") {
    return {
      agent: state.agent,
      ...(state.setup.position ? { position: state.setup.position } : {}),
    };
  }
  if (state.status === "error") {
    return {
      ...(state.agent ? { agent: state.agent } : {}),
      ...(state.position ? { position: state.position } : {}),
    };
  }
  return {};
}

function toError(state: DemoState, error: DemoError): DemoState {
  return {
    status: "error",
    error: { code: error.code, message: error.message },
    failedAt: state.status,
    ...contextOf(state),
  };
}

/**
 * Reducer puro de la demo. Un evento que no aplica al estado actual devuelve el
 * MISMO objeto. Los polls de setup y shock se casan con su agente o shockId, y
 * EXPIRED con el expiresAt del build actual. Los FAILED tardíos no llevan con qué
 * casarlos: quien despacha (F4) debe abortar las peticiones en vuelo al hacer RESET.
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
      // `position` es opcional en el contrato: un ready sin ella no se podría pagar nunca.
      if (event.setup.phase === "ready" && !event.setup.position) {
        return toError(state, {
          code: "SETUP_FAILED",
          message: "Demo setup finished without a position",
        });
      }
      return { ...state, setup: event.setup };
    }

    case "PAY":
      if (state.status === "setup" && state.setup.phase === "ready" && state.setup.position) {
        return { status: "paying", agent: state.agent, position: state.setup.position };
      }
      // Reintento sin repetir el setup: la posición del agente sigue ahí.
      if (state.status === "error" && state.agent && state.position) {
        return { status: "paying", agent: state.agent, position: state.position };
      }
      return state;

    case "BUILT":
      // Rebuild gratis (D19): tx nueva, mismo recibo y mismo shock del run.
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

    case "SHOCK_REQUESTED":
      // Un solo shock por run (D10): ni doble clic ni otro tras un rebuild.
      if (state.status !== "built" || state.run.shock) return state;
      return { status: "shocking", run: state.run, shockId: null };

    case "SHOCK_ACCEPTED":
      if (state.status !== "shocking" || state.shockId !== null) return state;
      return { ...state, shockId: event.shockId };

    case "SHOCK_SETTLED": {
      if (state.status !== "shocking" || event.shock.shockId !== state.shockId) return state;
      if (event.shock.status === "pending") return state;
      if (event.shock.status === "failed") {
        return toError(
          state,
          event.shock.error ?? { code: "SHOCK_FAILED", message: "Price shock failed" },
        );
      }
      return { status: "built", run: { ...state.run, shock: event.shock } };
    }

    case "SIGN":
      if (state.status !== "built") return state;
      return { status: "signing", run: state.run };

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
      // El blockhash caduca antes de enviar. Solo cuenta si caduca la tx ACTUAL:
      // un temporizador viejo (de antes de un rebuild) trae un now anterior.
      if (state.status !== "built" && state.status !== "shocking" && state.status !== "signing") {
        return state;
      }
      if (event.now < Date.parse(state.run.build.expiresAt)) return state;
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
