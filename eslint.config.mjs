import base from "./configs/eslint/base.mjs";

// Lints `scripts/` only — every other directory is a Turborepo workspace
// package with its own eslint.config.mjs, run via `turbo run lint`.
export default [
  ...base,
  {
    ignores: ["apps/**", "packages/**", "configs/**", "docs/**"],
  },
];
