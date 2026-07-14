import base from "../../configs/eslint/base.mjs";

export default [
  ...base,
  {
    rules: {
      // NestJS DI relies on classes with no logic beyond decorators/params
      // at this skeleton stage — not the "unused var" case the base rule
      // targets.
      "@typescript-eslint/no-extraneous-class": "off",
      // A constructor parameter's type must stay a real (value) import for
      // NestJS DI: `emitDecoratorMetadata` needs an actual runtime class
      // reference to build `design:paramtypes`, and `import type` erases
      // it entirely, silently breaking injection. This rule can't tell
      // "only used as a type" apart from "only used as a type, but that
      // type is also this class's DI token."
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
