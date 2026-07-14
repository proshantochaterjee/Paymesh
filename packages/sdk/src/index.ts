// Re-exports packages/shared so SDK consumers only need one import.
// Contract client bindings and the typed backend API client (src/contracts,
// src/api) land in Steps 9, 13, and 14 of docs/DEVELOPMENT_PLAN.md, as each
// domain they wrap is implemented.
export * from "@workforceos/shared";
export * from "./stellar/index.js";
