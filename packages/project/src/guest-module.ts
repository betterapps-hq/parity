import { iconStyleModules, libraryImports, type ProjectConfig, valueImports } from "@parity-app/core"
import { describedCategories, describedTokenCss } from "@parity-app/tokens"

/**
 * How a builder's guest module is written. Vite serves it as one module that makes the guest; a bundler builds it into
 * its bundle, and a module of the builder's own makes the guest from what it exports, with the CSS it extracted.
 */
export interface GuestModuleOptions {
  /** The specifier the renderer's guest runtime is imported by. */
  renderer: string
  /** The specifier a project file is imported by, from its path relative to the root. */
  projectPath: (path: string) => string
  /**
   * `inline`: the module imports each global stylesheet as text, with Vite's `?inline`, and makes the guest itself as
   * its default export. `bundled`: it imports none, since the bundler compiles them in entries of their own, and
   * exports `guestParts()`, which imports the guest's modules as they are then and gives `init` (what `createGuest`
   * takes, but the CSS), `libraryCss` and the renderer's `createGuest`.
   */
  styles: "inline" | "bundled"
}

/** The guest module's source, the modules it imports eagerly, and those of them it can do without. */
export interface GuestModule {
  source: string
  imports: string[]
  optional: ReadonlySet<string>
}

/**
 * The module the canvas's guest comes from: the renderer's guest runtime, the project's styles and components, its icon
 * packages, and what its extensions' and libraries' decorators import. A decorator's module that fails to load is passed on as its
 * error, so one missing provider doesn't stop the project from rendering. The source and its eager imports share one
 * declaration, so a builder can warm the same graph the browser will load.
 */
export function guestModule(config: ProjectConfig, options: GuestModuleOptions): GuestModule {
  const imports: string[] = []
  const optional = new Set<string>()
  const inline = options.styles === "inline"

  const ref = (id: string) => {
    if (!imports.includes(id)) {
      imports.push(id)
    }

    return `modules[${imports.indexOf(id)}]`
  }

  const renderer = ref(options.renderer)

  const packageStyleRefs = inline
    ? (config.packageStyles ?? []).map((specifier) => `${ref(`${specifier}?inline`)}.default`)
    : []

  const styleRefs = inline ? config.styles.map((path) => `${ref(`${options.projectPath(path)}?inline`)}.default`) : []
  // A library's components are imported by package name, which the project's own resolution finds. A project module
  // that fails to load (a server import, a syntax error) only costs its own components, which then show why. The rest
  // of the app, pages included, loads a module the first time one of its components is drawn: importing it all at once
  // took copacker 14 seconds.
  // A workspace package is the app's own code too, and may not build.
  const workspaceLibraries = new Set(config.libraries.filter((library) => library.workspace).map(({ id }) => id))
  const entries = Object.entries(config.components)

  const componentRefs = entries
    .filter(([, source]) => !source.lazy)
    .map(([id, source]) => {
      if (source.library && !workspaceLibraries.has(source.library)) {
        return `    ${JSON.stringify(id)}: ${ref(source.path)}${member(source.export)}`
      }

      const path = source.library ? source.path : options.projectPath(source.path)
      optional.add(path)
      const module = ref(path)

      return `    ${JSON.stringify(id)}: ${module}.loadError ? failed(${module}.loadError) : ${module}${member(source.export)}`
    })

  const lazyRefs = entries
    .filter(([, source]) => source.lazy)
    .map(([id, source]) => {
      const load = `import(${JSON.stringify(options.projectPath(source.path))})`

      return `    ${JSON.stringify(id)}: () => ${load}.then((module) => module${member(source.export)}, (error) => failed(String(error?.message ?? error)))`
    })

  // Icon packages come in whole, since any of their icons can be used; the dev server pre-bundles each one.
  const iconRefs = config.libraries
    .filter((library) => library.kind === "icons")
    .map((library) => {
      const icons = library.icons
      const set = [`module: ${ref(icons?.import ?? library.importName)}`]

      // Its other styles' modules, by the key their icons' ids name them with (`heroicons/16/solid/CogIcon`).
      const styles = iconStyleModules(icons, library.importName).map(
        (style) => `${JSON.stringify(style.key)}: ${ref(style.import)}`
      )

      if (styles.length > 0) {
        set.push(`styles: { ${styles.join(", ")} }`)
      }

      if (icons?.match) {
        set.push(`match: ${JSON.stringify(icons.match)}`)
      }

      if (icons?.exclude) {
        set.push(`exclude: ${JSON.stringify(icons.exclude)}`)
      }

      if (icons && icons.render !== "export") {
        const module = ref(icons.render.import)
        set.push(
          `renderer: { component: ${module}${member(icons.render.component)}, prop: ${JSON.stringify(icons.render.prop)} }`
        )
      }

      return `    ${JSON.stringify(library.id)}: { ${set.join(", ")} }`
    })

  // The extensions' come first, so they wrap the libraries': a router goes around a theme's provider, as in an app.
  const extensionDecorators = config.frameDecorators ?? []

  const decorated = [
    ...extensionDecorators.map(({ extension, decorator }) => ({ library: extension, decorator })),
    ...config.libraries.flatMap((library) =>
      (library.decorators ?? []).map((decorator) => ({ library: library.id, decorator }))
    )
  ]

  // Factories used by samples and library designs share one module registry. A design can call a module that no
  // component sample, decorator or icon needs; it must be loaded before that design is drawn too.
  const decoratorModules = [
    ...new Set([
      ...libraryImports({ decorators: extensionDecorators.map(({ decorator }) => decorator) }),
      ...config.libraries.flatMap((library) => libraryImports(library)),
      ...Object.values(config.components).flatMap((source) => valueImports(source.sample, "sample")),
      ...config.libraries.flatMap((library) => valueImports(library.designs, "sample"))
    ])
  ]

  for (const id of decoratorModules) {
    if (!imports.includes(id)) {
      optional.add(id)
    }

    ref(id)
  }

  const described = (config.describedTokens ?? []).flatMap((source) => source.tokens)
  const libraryCss = describedTokenCss(described)

  const loads = imports.map((id) =>
    optional.has(id)
      ? `import(${JSON.stringify(id)}).catch((error) => ({ loadError: String(error?.message ?? error) }))`
      : `import(${JSON.stringify(id)})`
  )

  const init = [
    "  components: {",
    componentRefs.join(",\n"),
    "  },",
    "  lazyComponents: {",
    lazyRefs.join(",\n"),
    "  },",
    "  iconSets: {",
    iconRefs.join(",\n"),
    "  },",
    "  decorators: {",
    `    list: ${JSON.stringify(decorated)},`,
    `    modules: { ${decoratorModules.map((id) => `${JSON.stringify(id)}: ${ref(id)}`).join(", ")} }`,
    "  },",
    `  tokenCategories: ${JSON.stringify(describedCategories(described))}`
  ]

  const made = inline
    ? [
        `export default ${renderer}.createGuest({`,
        // Tokens libraries only create at run time come first, so the project's own declarations still win.
        `  css: [${[...(libraryCss ? [JSON.stringify(libraryCss)] : []), ...styleRefs].join(", ")}].join("\\n"),`,
        ...(packageStyleRefs.length > 0 ? [`  packageCss: [${packageStyleRefs.join(", ")}].join("\\n"),`] : []),
        ...init,
        "})"
      ]
    : [
        "return {",
        "  init: {",
        ...init.map((line) => `  ${line}`),
        "  },",
        `  libraryCss: ${JSON.stringify(libraryCss ?? "")},`,
        `  createGuest: ${renderer}.createGuest`,
        "}"
      ]

  const body = [
    `const modules = await Promise.all([${loads.join(", ")}])`,
    "// A component whose module didn't load throws why when it's drawn, and its frame shows the error in its place.",
    "const failed = (error) => () => { throw new Error(`its module didn't load: ${error}`) }",
    ...made
  ]

  // Bundled, the modules are imported each time a guest is made, so one made after a hot update has its new code.
  const source = [
    ...(inline ? body : ["export async function guestParts() {", ...body.map((line) => `  ${line}`), "}"]),
    ""
  ].join("\n")

  return { source, imports, optional }
}

/** An export path as property access: `Button` is `["Button"]`, and `Dialog.Root` reads into the namespace. */
function member(path: string): string {
  return path
    .split(".")
    .map((part, index) => `${index === 0 ? "" : "?."}[${JSON.stringify(part)}]`)
    .join("")
}
