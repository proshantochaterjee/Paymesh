import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS relies on emitDecoratorMetadata for its DI container, which
// neither esbuild nor Vite 7/Vitest 4's new default `oxc` transform
// support — per docs/TESTING_STRATEGY.md this project uses Vitest (not the
// Nest CLI's default Jest), so SWC's decorator-metadata-aware transform
// stands in for both. `unplugin-swc` only disables `esbuild`; `oxc: false`
// is needed explicitly since Vitest 4 made oxc the default.
export default defineConfig({
  oxc: false,
  test: {
    root: "./",
    environment: "node",
    include: [
      "src/**/*.spec.ts",
      "test/**/*.spec.ts",
      "test/**/*.e2e-spec.ts",
      "test/**/*.integration-spec.ts",
    ],
    testTimeout: 60_000,
    // afterAll(app.close()) tears down real Stellar Testnet/BullMQ
    // connections opened during e2e specs, which can outlast Vitest's
    // 10s default hookTimeout under real network latency.
    hookTimeout: 60_000,
    setupFiles: ["./test/setup-env.ts"],
    // Step 10 added a second e2e spec that hits real Stellar Testnet
    // (employees.e2e-spec.ts, alongside treasury.e2e-spec.ts) — running
    // test files in Vitest's default parallel worker pool meant both
    // called the same real payroll_factory.create_organization around
    // the same time, which intermittently returned a malformed/empty RPC
    // simulation response (Spec.scValToNative crashing on `undefined`).
    // Confirmed as concurrency-only: each e2e-spec file passes reliably
    // in isolation. Serializing file execution trades a few seconds for
    // determinism against the real network.
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
