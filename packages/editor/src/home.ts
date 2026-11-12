import {
  type CanvasDocument,
  type ComponentSource,
  componentRole,
  type ContainerSpec,
  type DesignNode,
  type DeviceKind,
  generateId,
  type ModeSettings,
  modeDevice,
  pageRoute,
  type ResolvedMode,
  resolveModes
} from "@parity-app/core"

/** A project file as the project service reads it: its designs, or why it couldn't be read. */
export interface OpenedFile {
  path: string
  document?: CanvasDocument
  error?: string
}

/**
 * The designs a project opens with: its files' own, or, when it has no project file yet, the main one holding a Home
 * screen (see `homeScreen`). A file that couldn't be read still counts, so a broken file is never written over. The Home
 * screen is opened as if the file held it, so nothing is written until the person changes something.
 */
export function openingDesigns(
  files: readonly OpenedFile[],
  mainPath: string,
  components: Readonly<Record<string, ComponentSource>>,
  modes: ModeSettings
): { path: string; document: CanvasDocument }[] {
  if (files.length === 0) {
    return [{ path: mainPath, document: { version: 3, containers: [homeScreen(components, modes)] } }]
  }

  return files.flatMap(({ path, document }) => (document ? [{ path, document }] : []))
}

/**
 * The screen a project starts on: Home, for the app's `/` route, drawing the component that renders it (see
 * `homeComponent`), in the project's primary mode with a phone's mode beside it, or a laptop's or desktop's when the
 * primary mode is a phone's (see `besideMode`). An app with no such component gets a padded page with Home as its
 * heading, as New screen starts one.
 */
export function homeScreen(components: Readonly<Record<string, ComponentSource>>, modes: ModeSettings): ContainerSpec {
  const ids = new Set<string>()
  const rootId = generateId(ids)
  ids.add(rootId)
  const component = homeComponent(components)

  const content: DesignNode = component
    ? { type: "component", id: generateId(ids), component }
    : { type: "text", id: generateId(ids), tag: "h1", text: "Home", style: { size: "text-2xl", weight: 600 } }

  const beside = besideMode(modes)

  const home: ContainerSpec = {
    id: "home",
    name: "Home",
    kind: "screen",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: rootId,
      name: "Page",
      style: component
        ? { background: "background", foreground: "foreground" }
        : { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
      children: [content]
    }
  }

  if (beside) {
    home.view = { modes: [beside] }
  }

  return home
}

/**
 * The component that renders the app at `/`, by id: its page for `/`, by its router's file names, else the `App`
 * component that Vite's and Create React App's templates mount. The nearest the root wins when there are several, and a
 * route file's default export over its others. Undefined when the app has neither.
 */
export function homeComponent(components: Readonly<Record<string, ComponentSource>>): string | undefined {
  const own = Object.entries(components).filter(([, source]) => !source.library)
  const pages = own.filter(([, source]) => rendersRoot(source))
  const apps = own.filter(([, source]) => componentRole(source) !== "page" && isApp(source))

  return (pages.length > 0 ? pages : apps).sort(nearestFirst)[0]?.[0]
}

/**
 * Whether a page is the one for `/`: Next's `app/page`, outside any folder but route groups, or an index in a `pages` or
 * `routes` folder. Layouts, error pages and the like for `/` are parts of a page, not the page.
 */
function rendersRoot(source: ComponentSource): boolean {
  if (componentRole(source) !== "page") {
    return false
  }

  const route = pageRoute(source.path).replaceAll(/\/\([^/]+\)/g, "") || "/"
  const file = baseName(source.path)

  return route === "/" && (file === "page" || file === "index")
}

/** Whether a component is the app's root, by the name the templates give it. */
function isApp(source: ComponentSource): boolean {
  return source.export === "App" || (source.export === "default" && baseName(source.path) === "App")
}

/** Default exports first, then the fewest folders deep, then by path and id. */
function nearestFirst([a, one]: [string, ComponentSource], [b, other]: [string, ComponentSource]): number {
  const isDefault = (source: ComponentSource) => (source.export === "default" ? 0 : 1)
  const depth = (source: ComponentSource) => source.path.split("/").length

  return (
    isDefault(one) - isDefault(other) ||
    depth(one) - depth(other) ||
    one.path.localeCompare(other.path, "en") ||
    a.localeCompare(b, "en")
  )
}

/**
 * The mode shown beside the primary one: the first on a phone, or on a laptop or desktop when the primary mode is a
 * phone's, preferring one whose other options, such as its theme, match the primary mode's.
 */
function besideMode(settings: ModeSettings): string | undefined {
  const [primary, ...others] = resolveModes(settings)

  if (!primary) {
    return undefined
  }

  const wanted: DeviceKind[] = modeDevice(primary) === "phone" ? ["laptop", "desktop"] : ["phone"]
  const candidates = others.filter((mode) => wanted.includes(modeDevice(mode)))

  const matching = (mode: ResolvedMode) =>
    mode.options.filter(
      ({ variable, option }, index) => variable.kind !== "viewport" && primary.options[index]?.option.id === option.id
    ).length

  let best: ResolvedMode | undefined

  for (const mode of candidates) {
    if (!best || matching(mode) > matching(best)) {
      best = mode
    }
  }

  return best?.id
}

function baseName(path: string): string {
  return path
    .split("/")
    .at(-1)!
    .replace(/\.[cm]?[jt]sx?$/, "")
}
