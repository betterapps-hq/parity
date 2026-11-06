import { relative, resolve } from "node:path"
import {
  type ComponentEvidence,
  type ComponentInfo,
  type ComponentProp,
  type ComponentRole,
  type ComponentSource,
  componentRole,
  type RendererAdapter
} from "@parity-app/core"
import ts from "typescript"
import { componentOptions, findComponents, reactProbe, withReactProbe } from "./checker.ts"
import { type CheckResult, checkedChanges, componentIds, findAppComponents } from "./listing.ts"
import { inferProps, propsFiles } from "./props.ts"
import { importAlias, type ProjectTsconfig, readTsconfig } from "./tsconfig.ts"

/**
 * One of the app's components as Parity lists it, whatever the framework: its id, the file and export it comes from,
 * the import the app's code would write, its role, why it counts, and its props once read.
 */
export interface AppComponent {
  id: string
  /** Its file, relative to the project root. */
  path: string
  export: string
  /** What the app's code imports it from: the file through the tsconfig alias, else its path from the root. */
  import: string
  role: ComponentRole
  /** How it was recognised. Unset when the person listed it by hand. */
  evidence?: ComponentEvidence
  props?: ComponentProp[]
}

/**
 * How one framework's components are found, as `proposals/component-detection.md` describes. The quick pass is the
 * renderer adapter's parse; this is the thorough one, with the framework's type checker, and its props. All three can
 * share one TypeScript program. React's is `reactFinder`; Vue's would wrap vue-component-meta, and Svelte's would list
 * every `.svelte` file and read its props with Svelte's language tools.
 */
export interface ComponentFinder {
  /** The renderer it finds components for, by id, as `react`. */
  framework: string
  /** How its programs for the project at `root` are made, from the project's config as `tsconfig` reads it now. */
  programSetup(root: string, tsconfig: ProjectTsconfig): ProgramSetup
  /** A program over the app's files and what they import, for one-off callers; `programCache` keeps one per project. */
  program(root: string, files: readonly string[]): ts.Program
  /** Which exports of the app's `files`, relative to the root, are components, and why the others aren't. */
  check(root: string, files: readonly string[], program?: ts.Program): CheckResult
  /** Each component's props, by id. */
  props(root: string, sources: Record<string, ComponentSource>, program?: ts.Program): Record<string, ComponentInfo>
  /** The files `props` reads for `sources`, such as libraries' declarations, so one program can hold them too. */
  propsFiles(root: string, sources: Record<string, ComponentSource>): string[]
}

/**
 * What a finder's programs for one project are made with: the compiler options, a host wrapped to serve any file the
 * finder adds, and those added files, which every program holds as well as the app's.
 */
export interface ProgramSetup {
  options: ts.CompilerOptions
  host(base: ts.CompilerHost): ts.CompilerHost
  rootNames: string[]
}

export const reactFinder: ComponentFinder = {
  framework: "react",
  programSetup: (root, tsconfig) => ({
    options: componentOptions({ allowImportingTsExtensions: true, ...tsconfig.app?.options }),
    host: (base) => withReactProbe(base, root),
    rootNames: [reactProbe(root)]
  }),
  program(root, files) {
    const setup = reactFinder.programSetup(root, readTsconfig(root))
    return ts.createProgram({
      rootNames: [...files.map((file) => resolve(root, file)), ...setup.rootNames],
      options: setup.options,
      host: setup.host(ts.createCompilerHost(setup.options, true))
    })
  },
  check(root, files, program) {
    const entries = files.map((file) => resolve(root, file))
    const report = findComponents({ entries, root, defaultExports: true, ...(program ? { program } : {}) })
    const pathOf = (entry: string) => relative(root, entry).replaceAll("\\", "/")
    return {
      components: report.components.map((component) => ({
        name: component.name,
        path: pathOf(component.entry),
        export: component.export,
        as: component.as
      })),
      leftOut: [
        ...report.rejected.map((entry) => ({
          name: entry.name,
          path: pathOf(entry.entry ?? ""),
          export: entry.export ?? entry.name,
          reason: entry.reason
        })),
        ...report.ambiguous.map((entry) => ({
          name: entry.name,
          path: pathOf(entry.entry ?? ""),
          export: entry.export ?? entry.name,
          reason: entry.reason,
          undecided: true as const
        }))
      ].sort((a, b) => a.path.localeCompare(b.path, "en") || a.name.localeCompare(b.name, "en"))
    }
  },
  props: (root, sources, program) => (program ? inferProps(root, sources, program) : inferProps(root, sources)),
  propsFiles
}

/**
 * Lists an app's components through a finder, in one call: the renderer's parse, then the finder's check, then props,
 * all from one program. The app's service runs the same passes apart, so the list shows before the checker is done.
 */
export async function findAll(
  finder: ComponentFinder,
  renderer: RendererAdapter,
  root: string,
  uiKit?: string
): Promise<AppComponent[]> {
  const tsconfig = readTsconfig(root)
  const { found, files } = await findAppComponents(root, renderer, tsconfig, uiKit, [])
  const sources = componentIds(found)
  const program = finder.program(root, [...files, ...finder.propsFiles(root, sources)])
  const { added, confirmed, removed } = checkedChanges(sources, finder.check(root, files, program).components)
  for (const id of removed) delete sources[id]
  Object.assign(sources, confirmed, added)
  return appComponents(root, sources, finder.props(root, sources, program))
}

/** The app's own components in the contract's shape, from the list and props the passes made. Libraries' are left out. */
export function appComponents(
  root: string,
  sources: Record<string, ComponentSource>,
  props: Record<string, ComponentInfo>
): AppComponent[] {
  const tsconfig = readTsconfig(root)
  return Object.entries(sources).flatMap(([id, source]) => {
    const role = componentRole(source)
    if (!role) return []
    const info = props[id]
    return [
      {
        id,
        path: source.path,
        export: source.export,
        import: info?.import ?? importAlias(root, tsconfig, source.path) ?? source.path,
        role,
        ...(source.as ? { evidence: source.as } : {}),
        ...(info ? { props: info.props } : {})
      }
    ]
  })
}
