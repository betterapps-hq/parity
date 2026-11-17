import type {
  CatalogLibrary,
  DetectedLibrary,
  LibraryRemovalPlan,
  LibrarySetting,
  LibrarySetupPlan
} from "@parity-app/extension"
import { z } from "zod"

/*
 * What Parity knows of shadcn/ui, as functions of the project's files' text. shadcn-sync generates the components into
 * the app as `@buildkitgg/shadcn`, recording what it generated in that package's `manifest.json`; shadcn's own CLI
 * copies them into the app's source, recording its style in `components.json`. Either is read with the file Parity's
 * registry has for Buildkit's kit of the same style. Those files exist for the Base UI kits only, but a style's tokens
 * are the same on every base, so the app's own copies always use the Base UI kit's.
 */

/** sync's bases, each with the name its Buildkit kits have in their package names and the primitives' own. */
const bases = {
  base: { kit: "baseui", label: "Base UI", package: undefined },
  radix: { kit: "radix", label: "Radix", package: "radix-ui" },
  aria: { kit: "aria", label: "React Aria", package: "react-aria-components" }
} satisfies Record<string, { kit: string; label: string; package: string | undefined }>

type Base = keyof typeof bases

const styles = ["nova", "vega", "maia", "lyra", "mira", "luma", "sera", "rhea"] as const

const themes = ["neutral", "stone", "zinc", "gray", "mauve", "olive", "mist", "taupe"] as const

/**
 * The icon sets sync can give the components, by the id the settings choose them by: shadcn's own, which sync is given
 * by that id, and Buildkit's adapters, which it's given by package. Each lists the packages its imports need, the one
 * the icons come from first.
 */
const iconSets = {
  lucide: { label: "Lucide", flag: "lucide", packages: ["lucide-react"] },
  tabler: { label: "Tabler Icons", flag: "tabler", packages: ["@tabler/icons-react"] },
  hugeicons: { label: "Hugeicons", flag: "hugeicons", packages: ["@hugeicons/core-free-icons", "@hugeicons/react"] },
  phosphor: { label: "Phosphor", flag: "phosphor", packages: ["@phosphor-icons/react"] },
  remixicon: { label: "Remix Icon", flag: "remixicon", packages: ["@remixicon/react"] },
  fluent: {
    label: "Fluent icons",
    flag: "@buildkitgg/shadcn-icons-fluent",
    packages: ["@fluentui/react-icons", "@buildkitgg/shadcn-icons-fluent"]
  }
} satisfies Record<string, { label: string; flag: string; packages: [string, ...string[]] }>

type IconSet = keyof typeof iconSets

/** The package sync generates into each app, whichever base and style it was given. */
const syncedPackage = "@buildkitgg/shadcn"

/** The package that runs sync. */
const syncPackage = "@buildkitgg/shadcn-sync"

/** The range of sync Parity sets up. */
const syncRange = "^0.1.4"

/** What sync builds the components with. */
export interface SyncSettings {
  base: Base
  style: (typeof styles)[number]
  theme: (typeof themes)[number]
  /** One of shadcn's icon sets, or an icon adapter's package. */
  icons: string
  css: "compiled" | "tailwind"
}

const base = z.enum(["base", "radix", "aria"])
const style = z.enum(styles)
const theme = z.enum(themes)
const icons = z.enum(["lucide", "tabler", "hugeicons", "phosphor", "remixicon", "fluent"])
const css = z.enum(["compiled", "tailwind"])

/** The part of the `manifest.json` sync writes beside the components that says what it generated. */
const syncManifest = z.object({
  settings: z.object({ base, style, theme, icons: z.string(), css: css.default("compiled") })
})

/** The part of a package.json that says what the project depends on and runs. */
const packageJson = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional()
})

type PackageJson = z.infer<typeof packageJson>

/** The part of shadcn's `components.json` that says which style it copied, as `base-nova` or `new-york`. */
const componentsJson = z.object({ style: z.string(), iconLibrary: z.string().optional() })

/** Where in the project each file the extension reads is, relative to its root. */
export const projectFilePaths = {
  packageJson: "package.json",
  syncManifest: "node_modules/@buildkitgg/shadcn/manifest.json",
  componentsJson: "components.json"
} as const

/** The project's files the extension reads, through `read`, which rejects for a file that isn't there. */
export async function readProjectFiles(read: (path: string) => Promise<string>): Promise<ProjectFiles> {
  const text = (path: string) => read(path).catch(() => undefined)

  const [packageJson, syncManifest, componentsJson] = await Promise.all([
    text(projectFilePaths.packageJson),
    text(projectFilePaths.syncManifest),
    text(projectFilePaths.componentsJson)
  ])

  return { packageJson, syncManifest, componentsJson }
}

/** The project's files the extension reads, each undefined when it isn't there. */
export interface ProjectFiles {
  packageJson?: string
  /** `node_modules/@buildkitgg/shadcn/manifest.json`. */
  syncManifest?: string
  componentsJson?: string
}

/** A JSON file's value, or undefined when it isn't there or isn't JSON. */
function parsed<T>(schema: z.ZodType<T>, text: string | undefined): T | undefined {
  if (text === undefined) {
    return undefined
  }

  try {
    const result = schema.safeParse(JSON.parse(text))

    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function capitalized(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/** What sync generated, from its `manifest.json`. */
export function syncedSettings(manifest: string | undefined): SyncSettings | undefined {
  return parsed(syncManifest, manifest)?.settings
}

/**
 * The settings a script that runs sync gives it, as `shadcn-sync sync --base base --style nova`. Those it leaves out
 * are left out here too.
 */
export function scriptSettings(script: string | undefined): Partial<SyncSettings> {
  const run = commandsOf(script ?? "").find(({ command }) => command.includes("shadcn-sync"))?.command

  if (!run) {
    return {}
  }

  const flag = (name: string) => new RegExp(`--${name}[=\\s]+(\\S+)`).exec(run)?.[1]
  const found: Partial<SyncSettings> = {}
  const values = { base, style, theme, icons: z.string().regex(/^[@a-z0-9][\w./~-]*$/), css }

  for (const [key, schema] of Object.entries(values)) {
    const value = schema.safeParse(flag(key))

    if (value.success) {
      Object.assign(found, { [key]: value.data })
    }
  }

  return found
}

/** The libraries the project uses that its dependencies' names alone don't identify. */
export function detectLibraries(files: ProjectFiles): DetectedLibrary[] {
  const pkg = parsed(packageJson, files.packageJson) ?? {}
  const found: DetectedLibrary[] = []
  const synced = dependsOn(pkg, syncedPackage) ? syncedSettings(files.syncManifest) : undefined

  if (synced) {
    found.push(syncedLibrary(synced))
  }

  const copied = parsed(componentsJson, files.componentsJson)

  if (copied && !synced) {
    found.push(copiedLibrary(copied.style, copied.iconLibrary))
  }

  return found
}

/**
 * The components sync generated, read with the file for Buildkit's kit of the same base and style. In Tailwind mode the
 * app's Tailwind builds their classes from the package's `tailwind.css`; otherwise each component imports its own CSS.
 */
function syncedLibrary(settings: SyncSettings): DetectedLibrary {
  const library: DetectedLibrary = {
    registry: `@buildkitgg/shadcn-${bases[settings.base].kit}-${settings.style}`,
    package: syncedPackage,
    name: `Shadcn ${capitalized(settings.style)}`,
    description: `Every shadcn component on ${bases[settings.base].label}, in the ${settings.style} style.`
  }

  const iconPackage = iconSetOf(settings.icons)?.packages[0]

  return {
    ...library,
    ...(settings.css === "tailwind" && { tailwindEntry: "tailwind.css" }),
    ...(iconPackage && { icons: iconPackage })
  }
}

/**
 * Components shadcn's CLI copied into the app, as its `components.json` names their style: `base-nova` or `radix-nova`,
 * or a style from before shadcn named them by base, as `new-york`, which is read as nova.
 */
function copiedLibrary(registryStyle: string, iconLibrary: string | undefined): DetectedLibrary {
  const named = style.safeParse(registryStyle.split("-").at(-1))
  const id = named.success ? named.data : "nova"
  const iconPackage = iconSetOf(iconLibrary)?.packages[0]

  const library: DetectedLibrary = {
    registry: `@buildkitgg/shadcn-baseui-${id}`,
    name: `Shadcn ${capitalized(id)}`,
    description: `shadcn/ui components copied into the app, in the ${id} style.`
  }

  return iconPackage ? { ...library, icons: iconPackage } : library
}

/** The icon set sync was given, by the id the settings choose it by or the value sync takes, as an adapter's package. */
function iconSetIdOf(given: string | undefined): IconSet | undefined {
  const known = icons.safeParse(given)

  if (known.success) {
    return known.data
  }

  return icons.options.find((id) => iconSets[id].flag === given)
}

/** One of the icon sets sync can give the components, by its id or the value sync takes. */
function iconSetOf(given: string | undefined): (typeof iconSets)[IconSet] | undefined {
  const id = iconSetIdOf(given)

  return id ? iconSets[id] : undefined
}

function dependsOn(pkg: PackageJson, name: string): boolean {
  return pkg.dependencies?.[name] !== undefined || pkg.devDependencies?.[name] !== undefined
}

/**
 * The settings sync runs with now: what it generated last, else what the script that runs it says, else defaults, with
 * the icon set the project already has and Tailwind mode in a project with Tailwind.
 */
function currentSettings(files: ProjectFiles): SyncSettings {
  const pkg = parsed(packageJson, files.packageJson) ?? {}
  const generated = syncedSettings(files.syncManifest)

  if (generated) {
    return generated
  }

  const owned = Object.entries(iconSets).find(([, set]) => set.packages.some((name) => dependsOn(pkg, name)))
  const iconSet = icons.safeParse(owned?.[0])

  return {
    base: "base",
    style: "nova",
    theme: "neutral",
    icons: iconSet.success ? iconSet.data : "lucide",
    css: dependsOn(pkg, "tailwindcss") ? "tailwind" : "compiled",
    ...scriptSettings(pkg.scripts?.postinstall)
  }
}

/** The one library the extension sets up: shadcn's components, generated by sync. */
export function shadcnCatalog(files: ProjectFiles): CatalogLibrary[] {
  const pkg = parsed(packageJson, files.packageJson) ?? {}
  const current = currentSettings(files)
  // An icon adapter Parity doesn't know isn't one of the choices, so the choice starts at shadcn's default.
  const iconSet = iconSetIdOf(current.icons) ?? "lucide"

  return [
    {
      id: "shadcn",
      name: "Shadcn",
      description: "shadcn/ui's components, generated in the app by shadcn-sync.",
      package: syncedPackage,
      links: {
        website: "https://ui.shadcn.com",
        docs: "https://ui.shadcn.com/docs",
        source: "https://github.com/shadcn-ui/ui"
      },
      settings: shadcnSettings({ ...current, icons: iconSet }),
      installed: dependsOn(pkg, syncPackage)
    }
  ]
}

/** What Shadcn asks before it's set up, set to `values`: shadcn's style is the theme, and its theme the color. */
export function shadcnSettings(values: Pick<SyncSettings, "base" | "style" | "theme" | "icons">): LibrarySetting[] {
  const named = (ids: readonly string[]) => ids.map((id) => ({ value: id, label: capitalized(id) }))

  return [
    { id: "style", label: "Theme", options: named(styles), value: values.style },
    { id: "theme", label: "Color", options: named(themes), value: values.theme },
    {
      id: "base",
      label: "Base",
      options: Object.entries(bases).map(([value, { label }]) => ({ value, label })),
      value: values.base
    },
    {
      id: "icons",
      label: "Icons",
      options: Object.entries(iconSets).map(([value, { label }]) => ({ value, label })),
      value: values.icons
    }
  ]
}

/** The settings a request chose, checked against what sync takes. */
const chosen = z.object({ base, style, theme, icons })

/**
 * What setting Shadcn up with `settings` takes: sync as a dev dependency, the icon set and the base's primitives where
 * the project lacks them, and a `postinstall` that runs sync with the settings, in place of one that runs it already or
 * after the project's own. The install that follows runs it, which generates the components and adds
 * `@buildkitgg/shadcn` to the dependencies, as `link:` or npm's `file:`. In Tailwind mode the app's stylesheet imports
 * the components' `tailwind.css`.
 */
export function shadcnSetup(files: ProjectFiles, settings: Record<string, string>): LibrarySetupPlan {
  const request = chosen.safeParse(settings)

  if (!request.success) {
    throw new Error(`Shadcn's settings aren't ones shadcn-sync takes: ${request.error.message}`)
  }

  const pkg = parsed(packageJson, files.packageJson) ?? {}
  const { css: mode } = currentSettings(files)
  const next: SyncSettings = { ...request.data, css: mode }
  const primitives = bases[next.base].package

  const needed = [...iconSets[request.data.icons].packages, ...(primitives ? [primitives] : [])].filter(
    (name) => !dependsOn(pkg, name)
  )

  const plan: LibrarySetupPlan = { scripts: { postinstall: withSync(pkg.scripts?.postinstall, syncCommand(next)) } }

  if (!dependsOn(pkg, syncPackage)) {
    plan.devDependencies = { [syncPackage]: syncRange }
  }

  if (needed.length > 0) {
    plan.packages = needed
  }

  if (mode === "tailwind") {
    plan.styles = `${syncedPackage}/tailwind.css`
  }

  return plan
}

function syncCommand({
  base: chosenBase,
  icons: iconSet,
  style: chosenStyle,
  theme: chosenTheme,
  css: mode
}: SyncSettings) {
  return `shadcn-sync sync --base ${chosenBase} --icons ${iconSetOf(iconSet)?.flag ?? iconSet} --style ${chosenStyle} --theme ${chosenTheme} --css ${mode}`
}

/** A `postinstall` that runs `command`: in place of the part that runs sync now, or after what it runs already. */
/**
 * What taking Shadcn out takes: sync and the components it generated uninstalled, its part of postinstall gone, and its
 * stylesheet no longer imported. The icon set and primitives it added stay, since the app may use them itself.
 */
export function shadcnRemoval(files: ProjectFiles): LibraryRemovalPlan {
  const pkg = parsed(packageJson, files.packageJson) ?? {}
  const plan: LibraryRemovalPlan = { styles: `${syncedPackage}/tailwind.css` }
  const packages = [syncPackage, syncedPackage].filter((name) => dependsOn(pkg, name))
  const postinstall = pkg.scripts?.postinstall

  if (packages.length > 0) {
    plan.packages = packages
  }

  if (postinstall?.includes("shadcn-sync")) {
    plan.scripts = { postinstall: withoutSync(postinstall) ?? null }
  }

  return plan
}

/** A script's commands, each with the operator before it (`&&`, `||` or `;`), the first with none. */
function commandsOf(script: string): { operator: string; command: string }[] {
  const pieces = script.split(/(&&|\|\||;)/)
  const commands = [{ operator: "", command: pieces[0]?.trim() ?? "" }]

  for (let index = 1; index < pieces.length; index += 2) {
    commands.push({ operator: pieces[index] ?? "", command: pieces[index + 1]?.trim() ?? "" })
  }

  return commands.filter(({ command }) => command)
}

/** Joins commands back into a script, the first without its operator. */
function scriptOf(commands: { operator: string; command: string }[]): string | undefined {
  const text = commands
    .map(({ operator, command }, index) => {
      if (index === 0) {
        return command
      }

      return operator === ";" ? `; ${command}` : ` ${operator} ${command}`
    })
    .join("")

  return text || undefined
}

/** A script without the command that runs sync, or nothing when that was all it ran. */
function withoutSync(script: string): string | undefined {
  return scriptOf(commandsOf(script).filter(({ command }) => !command.includes("shadcn-sync")))
}

/** A script that runs sync as `command`: in place of the command that ran it, or after the rest. */
function withSync(script: string | undefined, command: string): string {
  const commands = commandsOf(script ?? "")

  if (!commands.some((part) => part.command.includes("shadcn-sync"))) {
    commands.push({ operator: "&&", command })
  }

  return (
    scriptOf(commands.map((part) => (part.command.includes("shadcn-sync") ? { ...part, command } : part))) ?? command
  )
}
