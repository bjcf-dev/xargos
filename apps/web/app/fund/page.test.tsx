import { describe, expect, it } from "vitest";
import FundPage from "./page";

describe("/fund", () => {
  // Sin NEXT_PUBLIC_FEATURE_AURORA (lo normal en los tests y en producción hasta el B18): 404.
  it("does not exist while the Aurora flag is off", () => {
    expect(() => FundPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
