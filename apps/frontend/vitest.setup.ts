import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest only exposes `globals.afterEach` when `test.globals: true` is set,
// which this config deliberately doesn't set (explicit imports everywhere
// else) — so RTL's own auto-cleanup (which registers against that global)
// silently never fires. Registering directly here is what actually unmounts
// components between tests instead of leaking DOM across them.
afterEach(() => {
  cleanup();
});
