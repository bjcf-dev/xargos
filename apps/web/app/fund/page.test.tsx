import { isValidElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/features", () => ({
  get auroraEnabled() {
    return flag.on;
  },
}));

import FundPage from "./page";

afterEach(() => {
  flag.on = false;
});

/** Todas las props de un árbol de elementos de React, en profundidad. */
function propsOf(node: unknown): Record<string, unknown>[] {
  if (!isValidElement(node)) return [];
  const props = (node as ReactElement<Record<string, unknown>>).props;
  const children = props.children;
  return [props, ...(Array.isArray(children) ? children : [children]).flatMap(propsOf)];
}

describe("/fund", () => {
  // Sin NEXT_PUBLIC_FEATURE_AURORA (lo normal en los tests y en producción hasta el B18): 404.
  it("does not exist while the Aurora flag is off", () => {
    expect(() => FundPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  // Es un componente de servidor: no puede pasarle funciones a la pantalla, que es de cliente.
  it("passes no functions to the client screen", () => {
    flag.on = true;
    const props = propsOf(FundPage());
    const functions = props.flatMap((p) =>
      Object.entries(p).filter(
        ([key, value]) =>
          key !== "children" &&
          (typeof value === "function" ||
            (typeof value === "object" &&
              value !== null &&
              Object.values(value).some((v) => typeof v === "function"))),
      ),
    );
    expect(functions.map(([key]) => key)).toEqual([]);
  });
});
