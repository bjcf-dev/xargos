import { type Dispatch, useReducer } from "react";
import { demoReducer } from "./reducer";
import { type DemoEvent, type DemoState, initialDemoState } from "./types";

/** Estado de la demo para las pantallas (F4). Las llamadas a la API solo despachan eventos. */
export function useDemoMachine(): readonly [DemoState, Dispatch<DemoEvent>] {
  return useReducer(demoReducer, initialDemoState);
}
