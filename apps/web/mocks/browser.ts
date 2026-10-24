import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";

// Algo de latencia para que en la demo se vean los estados de carga y el polling.
export const worker = setupWorker(...createHandlers({ latencyMs: 400 }));
