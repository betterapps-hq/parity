import type { AdoptSpec, Candidate, Parity, ProcessHandle, ProcessInfo } from "@parity-app/extension-api"
import {
  componentsWithStories,
  type DetectedStorybook,
  type IndexEntry,
  readDetected,
  readStoryIndex,
  servesStories,
  storyPage
} from "./storybook.ts"
import { componentStories, setupGuide, storiesTree } from "./views.ts"

/*
 * Storybook as an extension (PAR-1089), using only Parity's public API: Open in Storybook on component cards, layers
 * and Search actions, greyed where a component has no stories, and the status bar's count of components with stories.
 * Its declarative views (PAR-1094) are the Stories tab, a Stories section in the Design tab for the selected component,
 * and a setup guide that Show Storybook setup opens.
 * Its settings (PAR-1090) are the project's config folder, which detection reads from the main `.par` before this code
 * loads, and where stories open, the person's choice for every project.
 * Its manifest, in package.json, draws all of that before this code loads. Opening finds the project's Storybook where
 * it already runs, by its Portless name or on its usual port, and adopts it, or starts it with `parity.processes`.
 */

export function activate(parity: Parity): void {
  const storybook = readDetected(parity.project.detected)

  if (!storybook) {
    parity.log.warn("Detection found no Storybook that this version can read.")

    return
  }

  const withStories = componentsWithStories(storybook)
  parity.log.info(
    `Found Storybook's config in ${storybook.configDir}, with stories for ${withStories.length} components`
  )
  parity.context.set("storybook.hasStories", withStories)

  for (const key of withStories) {
    const stories = storybook.stories[key]?.length ?? 0
    parity.facts.set({ type: "component", key }, [
      { id: "stories", label: stories === 1 ? "story" : "stories", value: String(stories) }
    ])
  }

  const count = parity.status.item("storybook.stories")
  const noun = withStories.length === 1 ? "component" : "components"
  count.set({
    value: String(withStories.length),
    tooltip: `${withStories.length} ${noun} with stories. Click to open it`
  })
  parity.subscriptions.push(count)

  const tree = storiesTree(storybook)
  const stories = parity.views.tree("storybook.stories", tree.options)
  stories.set(tree.items)

  const section = componentStories(storybook)
  const selected = parity.views.list("storybook.componentStories", section.options)
  selected.set(section.items)

  const guide = setupGuide(storybook)
  const setup = parity.views.list("storybook.setupGuide", guide.options)
  setup.set(guide.items)
  parity.subscriptions.push(stories, selected, setup)

  parity.subscriptions.push(parity.commands.register("storybook.setup", () => setup.reveal()))

  const paths = Object.values(storybook.stories).flatMap((files) => files.map((file) => file.path))
  let finding: Promise<ProcessHandle> | undefined

  /** The project's Storybook, ready, with its stories: found or started once, then reused while it answers. */
  const ensure = async (): Promise<{ server: ProcessInfo; entries: IndexEntry[] }> => {
    // Two opens at once share one lookup, so they don't both adopt, or one adopt while the other starts.
    finding ??= serve(parity, storybook, paths).finally(() => (finding = undefined))
    const handle = await finding
    const server = await handle.ready()
    setup.set(setupGuide(storybook, { address: await addressOf(parity, server) }).items)
    const entries = server.endpoint && (await storyIndex(server.endpoint.url).catch(() => undefined))

    if (entries) {
      return { server, entries }
    }

    // Closed by hand, or answering with something else: it's found or started again.
    await handle.stop()
    finding ??= serve(parity, storybook, paths).finally(() => (finding = undefined))
    const again = await (await finding).ready()
    setup.set(setupGuide(storybook, { address: await addressOf(parity, again) }).items)

    if (!again.endpoint) {
      throw new Error("Storybook started without a port")
    }

    return { server: again, entries: await storyIndex(again.endpoint.url) }
  }

  parity.subscriptions.push(
    parity.commands.register("storybook.open", async (target) => {
      const component = target?.type === "component" ? target.key : undefined
      const storyFiles = component ? (storybook.stories[component] ?? []).map((file) => file.path) : []

      if (component && storyFiles.length === 0) {
        throw new Error(`${component} has no stories`)
      }

      const url = await parity.ui.progress("Opening Storybook…", async (progress) => {
        progress.report("If it isn't running yet, it starts first, which can take a minute.")
        const { server, entries } = await ensure()
        const address = await addressOf(parity, server)

        return component ? storyPage(address, entries, storyFiles) : address
      })

      // Where stories open is the person's choice, for every project (PAR-1090).
      const where = parity.settings.get("storybook.openIn") === "parity" ? "parity" : "browser"
      await parity.ui.open(url, { where })

      if (where === "browser") {
        void parity.ui.notify("Opened in your browser", { detail: url, tone: "success" })
      }
    })
  )
}

/** The project's Storybook: ours already, one running that serves its stories, adopted, or one started. */
async function serve(parity: Parity, storybook: DetectedStorybook, paths: string[]): Promise<ProcessHandle> {
  // Ours already, started or adopted earlier, or before the host started again.
  const known = parity.processes.get("storybook")

  if (known && ["starting", "running"].includes(known.info.state)) {
    return known
  }

  const wanted = storybook.port ?? 6006

  // Without stories to check, a routed Storybook could be any project's, so only the usual port is tried.
  const found: (Candidate | AdoptSpec)[] = await parity.processes.find({
    ports: [wanted],
    discovered: paths.length > 0
  })

  if (paths.length > 0) {
    const ports = new Set(found.map((candidate) => candidate.endpoint.port))

    for (const route of await parity.servers.routed()) {
      const port = Number(new URL(route.url).port)

      if (!ports.has(port)) {
        found.push({ endpoint: { url: route.url, port, protocol: "http" } })
      }
    }
  }

  const serving: (Candidate | AdoptSpec)[] = []

  for (const candidate of found) {
    // Another server on the port answers with an error, or not at all.
    const entries = await storyIndex(candidate.endpoint.url).catch(() => undefined)

    if (entries && servesStories(entries, paths)) {
      serving.push(candidate)
    }
  }

  // Two worktrees can serve the same stories: the one serving this checkout's files is ours.
  const mine: (Candidate | AdoptSpec)[] = []

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

/** Where the browser opens a Storybook: its Portless name when Portless routes to its port, else where it answers. */
async function addressOf(parity: Parity, server: ProcessInfo): Promise<string> {
  const endpoint = server.endpoint

  if (!endpoint) {
    throw new Error("Storybook isn't listening yet")
  }

  const routed = await parity.servers.routed().catch(() => [])
  const route = routed.find((each) => Number(new URL(each.url).port) === endpoint.port)

  return route?.address ?? server.opens ?? endpoint.url
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
