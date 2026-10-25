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

    case "FAILED":
      return IN_FLIGHT.has(state.status) ? toError(state, event.error) : state;

    case "RESET":
      return initialDemoState;

    default:
      return state;
  }
}
