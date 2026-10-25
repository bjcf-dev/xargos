import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";
import { startOnce } from "./start-once";
import { onUnhandledFrame } from "./unhandled";

// Algo de latencia para que en la demo se vean los estados de carga y el polling.
const worker = setupWorker(...createHandlers({ latencyMs: 400 }));

export const startMockWorker = startOnce(() => worker.start({ onUnhandledFrame, quiet: true }));
