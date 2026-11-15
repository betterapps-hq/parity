import { containerSpec, parseData } from "@parity-app/core"
import type { Candidate, Parity, ProcessHandle, ProcessInfo } from "@parity-app/extension-api"
import { projectSource } from "@parity-app/project"
import { exportStoryScreen, importStories } from "./screens.ts"
import {
  componentsWithStories,
  type IndexEntry,
  type PageKind,
  type ProjectStorybook,
  projectStorybook,
  readStoryIndex,
  scriptsOf,
  servesStories,
  storyPage
} from "./storybook.ts"
import { componentStories, setupGuide, storiesTree } from "./views.ts"

/*
 * Storybook as an extension (PAR-1089), using only Parity's public API: Open in Storybook on component cards, layers
 * and Search actions, greyed where a component has no stories, and the status bar's count of components with stories.
 * Its declarative views (PAR-1094) are the Stories tab, a Stories section in the Design tab for the selected component,
 * and a setup guide that Show Storybook setup opens.
 * Its settings (PAR-1090) are the project's config folder and where stories open, the person's choice for every project.
 * Parity finds it where its entities detection finds the project's Storybook (PAR-1128), and the extension reads the
 * rest itself: its config folder and port from the settings and the `storybook dev` script, and which components have
 * stories as its entities provider reads the story files, each time Parity imports them.
 * Its manifest, in package.json, draws all of that before this code loads. Opening finds the project's Storybook where
 * it already runs, as a discovery provider such as Portless finds it or on its usual port, and adopts it, or starts it
 * with `parity.processes`. It opens at the server's preferred address, as the name Portless gives it. What `activate`
 * returns is its API for other extensions (PAR-1096), as the accessibility extension uses it, and Open in Storybook
 * gives agents the page it opened.
 * Its entities provider (PAR-1095) reads the project's story files as screens, each story a state, and writes a story's
 * edited args back to its file on Save.
 */

/**
 * The Storybook extension's API, which extensions that name it in `extensionDependencies` get with
 * `parity.extensions.get("@parity-app/extension-storybook").api`, each function giving a promise there.
 */
export type StorybookApi = {
  /** The components with stories, by key, once the project's story files have been read. */
  componentsWithStories(): Promise<string[]>
  /** A component's story files, relative to the project's root. */
  storyFiles(component: string): string[]
  /**
   * The page that opens a component's stories in the project's Storybook, or Storybook's home without one, starting
   * Storybook first when it isn't running: its docs page when it has one, or with `kind` "story" its first story.
   * Throws for a component with no stories.
   */
  storyPage(component?: string, kind?: PageKind): Promise<string>
}

export function activate(parity: Parity): StorybookApi {
  const { root } = parity.project

  // Until the story files are read, Storybook is found in its usual folder, with no stories.
  let storybook: ProjectStorybook = projectStorybook(undefined, configDir(parity), {})
  let shown: string[] = []
  let read: () => void = () => undefined
  const firstRead = new Promise<void>((resolve) => (read = resolve))

  const count = parity.status.item("storybook.stories")
  const tree = parity.views.tree("storybook.stories", storiesTree(storybook).options)
  const selected = parity.views.list("storybook.componentStories", componentStories(storybook).options)
  const setup = parity.views.list("storybook.setupGuide", setupGuide(storybook).options)
  parity.subscriptions.push(count, tree, selected, setup)

  /** Shows what was read of the project's stories: the context key, each component's facts, the count and the views. */
  const show = (next: ProjectStorybook) => {
    storybook = next
    const withStories = componentsWithStories(storybook)
    parity.log.info(
      `Found Storybook's config in ${storybook.configDir}, with stories for ${withStories.length} components`
    )
    parity.context.set("storybook.hasStories", withStories)

    // A component that no longer has stories loses its facts.
    for (const key of shown.filter((each) => !withStories.includes(each))) {
      parity.facts.set({ type: "component", key }, [])
    }

    for (const key of withStories) {
      const stories = storybook.stories[key]?.length ?? 0
      parity.facts.set({ type: "component", key }, [
        { id: "stories", label: stories === 1 ? "story" : "stories", value: String(stories) }
      ])
    }

    shown = withStories
    const noun = withStories.length === 1 ? "component" : "components"
    count.set({
      value: String(withStories.length),
      tooltip: `${withStories.length} ${noun} with stories. Click to open it`
    })
    tree.set(storiesTree(storybook).items)
    selected.set(componentStories(storybook).items)
    setup.set(setupGuide(storybook).items)
  }

  parity.subscriptions.push(
    parity.providers.register("entities", {
      // Each import reads the story files afresh, so what the extension shows follows them.
      async import({ components }) {
        const source = projectSource(root, components)

        try {
          const imported = await importStories(source)
          show(projectStorybook(scriptsOf(await source.read("package.json")), configDir(parity), imported.stories))

          return imported.entities
        } finally {
          read()
        }
      },
      // The design comes from Parity, which checked it; it's read as a container here all the same.
      export: ({ screen, edited, components }) =>
        exportStoryScreen(
          { ...screen, screen: parseData(containerSpec, screen.screen, "the imported screen") },
          parseData(containerSpec, edited, "the edited screen"),
          projectSource(root, components)
        )
    })
  )

  parity.subscriptions.push(parity.commands.register("storybook.setup", () => setup.reveal()))

  /** Every story file, so a running Storybook can be told for the project's. */
  const paths = () => Object.values(storybook.stories).flatMap((files) => files.map((file) => file.path))
  let finding: Promise<ProcessHandle> | undefined

  /** The project's Storybook, ready, with its stories: found or started once, then reused while it answers. */
  const ensure = async (): Promise<{ server: ProcessInfo; entries: IndexEntry[] }> => {
    // Two opens at once share one lookup, so they don't both adopt, or one adopt while the other starts.
    finding ??= serve(parity, storybook, paths()).finally(() => (finding = undefined))
    const handle = await finding
    const server = await handle.ready()
    setup.set(setupGuide(storybook, { address: addressOf(server) }).items)
    const entries = server.endpoint && (await storyIndex(server.endpoint.url).catch(() => undefined))

    if (entries) {
      return { server, entries }
    }

    // Closed by hand, or answering with something else: it's found or started again.
    await handle.stop()
    finding ??= serve(parity, storybook, paths()).finally(() => (finding = undefined))
    const again = await (await finding).ready()
    setup.set(setupGuide(storybook, { address: addressOf(again) }).items)

    if (!again.endpoint) {
      throw new Error("Storybook started without a port")
    }

    return { server: again, entries: await storyIndex(again.endpoint.url) }
  }

  const storyFiles = (component: string) => (storybook.stories[component] ?? []).map((file) => file.path)

  /** The page that opens a component's stories, or Storybook's home, with Storybook running. */
  const pageOf = async (component: string | undefined, kind?: PageKind) => {
    const paths = component ? storyFiles(component) : []

    if (component && paths.length === 0) {
      throw new Error(`${component} has no stories`)
    }

    const { server, entries } = await ensure()
    const address = addressOf(server)

    return component ? storyPage(address, entries, paths, kind) : address
  }

  parity.subscriptions.push(
    parity.commands.register("storybook.open", async (target) => {
      const component = target?.type === "component" ? target.key : undefined

      if (component && storyFiles(component).length === 0) {
        throw new Error(`${component} has no stories`)
      }

      const url = await parity.ui.progress("Opening Storybook…", async (progress) => {
        progress.report("If it isn't running yet, it starts first, which can take a minute.")

        return pageOf(component)
      })

      // Where stories open is the person's choice, for every project (PAR-1090).
      const where = parity.settings.get("storybook.openIn") === "parity" ? "parity" : "browser"
      await parity.ui.open(url, { where })

      if (where === "browser") {
        void parity.ui.notify("Opened in your browser", { detail: url, tone: "success" })
      }

      // What an agent that ran it gets back.
      return { url }
    })
  )

  return {
    componentsWithStories: async () => {
      await firstRead

      return componentsWithStories(storybook)
    },
    storyFiles,
    storyPage: pageOf
  }
}

/** The config folder the project's `storybook.configDir` setting gives, a string as the manifest declares it. */
function configDir(parity: Parity): string {
  return parity.settings.get<string>("storybook.configDir")
}

/** The project's Storybook: ours already, one running that serves its stories, adopted, or one started. */
async function serve(parity: Parity, storybook: ProjectStorybook, paths: string[]): Promise<ProcessHandle> {
  // Ours already, started or adopted earlier, or before the host started again.
  const known = parity.processes.get("storybook")

  if (known && ["starting", "running"].includes(known.info.state)) {
    return known
  }

  const wanted = storybook.port ?? 6006

  // Without stories to check, a discovered Storybook could be any project's, so only the usual port is tried.
  const found = await parity.processes.find({ ports: [wanted], discovered: paths.length > 0 })
  const serving: Candidate[] = []

  for (const candidate of found) {
    // Another server on the port answers with an error, or not at all.
    const entries = await storyIndex(candidate.endpoint.url).catch(() => undefined)

    if (entries && servesStories(entries, paths)) {
      serving.push(candidate)
    }
  }

  // Two worktrees can serve the same stories: the one serving this checkout's files is ours.
  const mine: Candidate[] = []

  for (const candidate of serving) {
    if (serving.length === 1 || (await servesFrom(candidate.endpoint.url, parity.project.root))) {
      mine.push(candidate)
    }
  }

  const [only] = mine

  if (only && mine.length === 1) {
    return parity.processes.adopt(only, { id: "storybook", name: "Storybook" })
  }

  return parity.processes.start({
    id: "storybook",
    name: "Storybook",
    lifetime: "server",
    run: { bin: "storybook" },
    args: ["dev", "--port", "{port}", "--no-open", "--ci", "--config-dir", storybook.configDir],
    port: { prefer: wanted },
    ready: { http: "/index.json" },
    env: { BROWSER: "none" },
    icon: "book-open",
    role: "Serves stories"
  })
}

/** Where the browser opens a Storybook: its preferred address, as a name Portless routes to it, else where it answers. */
function addressOf(server: ProcessInfo): string {
  const address = server.opens ?? server.endpoint?.url

  if (!address) {
    throw new Error("Storybook isn't listening yet")
  }

  return address
}

/** The stories and docs pages a Storybook at `base` serves. Rejects when nothing answers there. */
async function storyIndex(base: string): Promise<IndexEntry[]> {
  const response = await fetch(`${base}/index.json`, { signal: AbortSignal.timeout(3000) })

  if (!response.ok) {
    throw new Error(`Storybook answered ${response.status}`)
  }

  return readStoryIndex(await response.json())
}

/**
 * Whether a Storybook serves files from the project's folder, to tell its checkout's from a worktree's that serves the
 * same stories. Vite, which builds most Storybooks, serves only the folders it allows and answers Forbidden for the
 * rest; with another builder, it can't tell.
 */
function servesFrom(base: string, root: string): Promise<boolean> {
  const file = `${root.replaceAll("\\", "/").replace(/^\//, "")}/package.json`

  return fetch(`${base}/@fs/${file}`, { signal: AbortSignal.timeout(5000) }).then(
    (response) => response.ok,
    () => false
  )
}
