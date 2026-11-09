// Decorator and sample values: checked by `grammar.ts` with zod when their file loads, and imported, evaluated and
// keyed by `evaluate.ts`, which the guest imports alone (`@parity-app/core/values/evaluate`) since it runs without zod.
export * from "./evaluate.ts"

export * from "./grammar.ts"
