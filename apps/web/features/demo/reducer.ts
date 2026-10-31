import { DemoSetupPhase } from "@xargos/shared";
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

/** Orden de las fases del setup (sin `failed`, que puede llegar en cualquier momento). */
const SETUP_ORDER: readonly DemoSetupPhase[] = DemoSetupPhase.options.filter(
  (phase) => phase !== "failed",
);

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

/** Solo los campos de DemoError: lo que llegue de más no entra en el estado. */
function copyError(error: DemoError): DemoError {
  return {
    code: error.code,
    message: error.message,
    ...(error.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {}),
    ...(error.unreachable ? { unreachable: true as const } : {}),
    ...(error.rejected ? { rejected: true as const } : {}),
  };
}

function toError(state: DemoState, error: DemoError): DemoState {
  return { status: "error", error: copyError(error), failedAt: state.status, ...contextOf(state) };
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
      // Un poll desordenado no puede hacer retroceder la fase (ni desactivar Pagar).
      if (SETUP_ORDER.indexOf(event.setup.phase) < SETUP_ORDER.indexOf(state.setup.phase)) {
        return state;
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
        // D19: el rebuild gratis conserva el buildId; otro build no es este run.
        if (event.build.buildId !== state.run.build.buildId) return state;
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
      // La cadena ya no conoce el blockhash: nada entró, así que es una caducidad con rebuild
      // gratis, no un error. El signer solo da BUILD_EXPIRED antes de enviar; una tx enviada
      // sin confirmar llega como INTERNAL con su firma (send.ts) y no abre el rebuild.
      if (state.status === "signing" && event.error.code === "BUILD_EXPIRED") {
        return { status: "expired", run: state.run };
      }
      // Un fallo pasajero del rebuild (red, 502, 429) no gasta la ventana gratis: se vuelve a
      // caducada con el error a la vista. Solo el 410 del backend la cierra.
      if (state.status === "rebuilding" && event.error.code !== "REBUILD_WINDOW_CLOSED") {
        return { status: "expired", run: state.run, error: copyError(event.error) };
      }
      return IN_FLIGHT.has(state.status) ? toError(state, event.error) : state;

    case "RESET":
      return initialDemoState;

    default: {
      // Si se añade un evento a DemoEvent sin tratarlo aquí, esto no compila.
      const unhandled: never = event;
      void unhandled;
      return state;
    }
  }
}
