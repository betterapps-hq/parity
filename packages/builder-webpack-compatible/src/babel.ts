import { z } from "zod"
import { bundlerRule, ruleUse } from "./bundler.ts"

/*
 * Babel finds a project's `babel.config.*` from its working directory, and a tool's CLI runs from the project's folder.
 * The builder's process doesn't, so each `babel-loader` in the project's rules is told to work from the project's folder,
 * as it would under `webpack serve` or `rspack dev`. Configs beside a file (`.babelrc`) are found from the file anyway.
 */

/** Whether a loader is `babel-loader`, by name or by its file. */
const babelLoader = /(?:^|[\\/])babel-loader(?:[\\/]|$)/

/** A rule or a loader in a rule's `use`, with the options it passes its loader. */
const loaderWithOptions = z.looseObject({ options: z.unknown().optional() })

/** A loader's options, as far as this reads them: whether they set Babel's `cwd` already. */
const loaderOptions = z.looseObject({ cwd: z.string().optional() }).catch({})

/**
 * A rule whose `babel-loader` works from the project's folder, `root`, unless its options already say where; nested
 * rules (`oneOf`, `rules`) too. A rule written some other way is left as it is.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- a project's rule, whatever its tool accepts, read here by `bundlerRule` and passed on
export function babelFromRoot(entry: unknown, root: string): unknown {
  const rule = bundlerRule.safeParse(entry)

  if (!rule.success) {
    return entry
  }

  const { data } = rule
  const changed = { ...data, ...loaderWithOptions.parse(entry) }

  if (data.loader && babelLoader.test(data.loader)) {
    changed.options = withCwd(changed.options, root)
  }

  if (data.use !== undefined) {
    changed.use = babelUse(data.use, root)
  }

  if (data.oneOf) {
    changed.oneOf = data.oneOf.map((inner) => babelFromRoot(inner, root))
  }

  if (data.rules) {
    changed.rules = data.rules.map((inner) => babelFromRoot(inner, root))
  }

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- the rule as read, passed on as the project's tool takes it
  return changed
}

/** A rule's `use` with each `babel-loader` working from `root`, however it's written; a function's as it gives them. */
function babelUse(use: z.output<typeof ruleUse>, root: string): z.output<typeof ruleUse> {
  if (use instanceof Function) {
    return (info) => babelUse(ruleUse.parse(use(info)), root)
  }

  if (Array.isArray(use)) {
    return use.map((one) => babelEntry(one, root))
  }

  return babelEntry(use, root)
}

function babelEntry(use: string | { loader?: string }, root: string): string | { loader?: string } {
  const name = use instanceof Object ? use.loader : use

  if (!name || !babelLoader.test(name)) {
    return use
  }

  return use instanceof Object
    ? { ...use, options: withCwd(loaderWithOptions.parse(use).options, root) }
    : { loader: use, options: { cwd: root } }
}

/** A loader's options with Babel's `cwd` as `root`, unless they say already; a query string's are left as they are. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- a loader's options, whatever it accepts, passed on
function withCwd(options: unknown, root: string): unknown {
  // A query string, as `babel-loader?presets[]=x` gives, is the project's to keep.
  if (z.string().safeParse(options).success) {
    return options
  }

  const read = loaderOptions.parse(options ?? {})

  return read.cwd === undefined ? { ...read, cwd: root } : options
}
