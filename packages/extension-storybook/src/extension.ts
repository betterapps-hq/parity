import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { Parity } from "@parity-app/extension-api"
import { z } from "zod"
import {
  componentsWithStories,
  type DetectedStorybook,
  type IndexEntry,
  readDetected,
  readStoryIndex,
  servesStories,
  storyPage
} from "./storybook.ts"

/*
 * Storybook as an extension (PAR-1089), using only Parity's public API: Open in Storybook on component cards, layers
 * and Search actions, greyed where a component has no stories, and the status bar's count of components with stories.
 * Its manifest, in package.json, draws all of that before this code loads. Opening finds the project's Storybook where
 * it already runs, by its Portless name or on its usual port, or starts it through Parity's process manager.
 */

/** A running Storybook: where Parity reaches it, and where the browser opens it, by its Portless name when it has one. */
interface Running {
  url: string
  address: string
}

/** The fields of Storybook's own package.json that say where its command line is. */
const storybookManifest = z.looseObject({ bin: z.union([z.string(), z.record(z.string(), z.string())]).optional() })

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

  let running: Promise<Running> | undefined

  /** The project's Storybook, found or started once and then reused while it answers. */
  const ensure = async (): Promise<{ running: Running; entries: IndexEntry[] }> => {
    running ??= find(parity, storybook)

    let found: Running

    try {
      found = await running
    } catch (error) {
      running = undefined
      throw error
    }

    const entries = await storyIndex(found.url).catch(() => undefined)

    if (entries) {
      return { running: found, entries }
    }

    // Stopped since it was last used, closed by hand or crashed: it's found or started again.
    parity.servers.stop("storybook")
    running = find(parity, storybook)
    const again = await running

    return { running: again, entries: await storyIndex(again.url) }
  }

  parity.subscriptions.push(
    parity.commands.register("storybook.open", async (target) => {
      const component = target?.type === "component" ? target.key : undefined
      const paths = component ? (storybook.stories[component] ?? []).map((file) => file.path) : []

      if (component && paths.length === 0) {
        throw new Error(`${component} has no stories`)
      }

      const url = await parity.ui.progress("Opening Storybook…", async (progress) => {
        progress.report("If it isn't running yet, it starts first, which can take a minute.")
        const { running: found, entries } = await ensure()

        return component ? storyPage(found.address, entries, paths) : found.address
      })

      await parity.ui.open(url)
      void parity.ui.notify("Opened in your browser", { detail: url, tone: "success" })
    })
  )
}

/** Finds the project's Storybook where it runs already, or starts it. */
async function find(parity: Parity, storybook: DetectedStorybook): Promise<Running> {
  const paths = Object.values(storybook.stories).flatMap((files) => files.map((file) => file.path))

  const serves = (base: string) =>
    storyIndex(base).then(
      (entries) => servesStories(entries, paths),
      () => false
    )

  // One Portless routes to opens at its name. Without stories to check, a routed Storybook could be any project's.
  if (paths.length > 0) {
    const routed = await parity.servers.routed()
    const serving = (await Promise.all(routed.map(async (route) => ((await serves(route.url)) ? [route] : [])))).flat()

    const mine =
      serving.length > 1
        ? (
            await Promise.all(
              serving.map(async (route) => ((await servesFrom(route.url, parity.project.root)) ? [route] : []))
            )
          ).flat()
        : serving

    if (mine.length === 1) {
      const [route] = mine

      if (route) {
        parity.servers.adopt({ id: "storybook", name: "Storybook", url: route.url })

        return route
      }
    }
  }

  const wanted = storybook.port ?? 6006
  const usual = `http://localhost:${wanted}`

  if (await serves(usual)) {
    parity.servers.adopt({ id: "storybook", name: "Storybook", url: usual })

    return { url: usual, address: usual }
  }

  const { url } = await parity.servers.serve({
    id: "storybook",
    name: "Storybook",
    script: commandLine(parity.project.root),
    args: ["dev", "--port", "{port}", "--no-open", "--ci", "--config-dir", storybook.configDir],
    port: wanted,
    readyPath: "/index.json",
    env: { BROWSER: "none" }
  })

  return { url, address: url }
}

/** Storybook's command line, from the copy installed in the project. */
function commandLine(root: string): string {
  const require = createRequire(join(root, "package.json"))
  let manifestPath: string

  try {
    manifestPath = require.resolve("storybook/package.json")
  } catch {
    throw new Error("Storybook isn't installed in the project. Install its dependencies first.")
  }

  const { bin } = storybookManifest.parse(JSON.parse(readFileSync(manifestPath, "utf8")))
  const script = bin instanceof Object ? (bin.storybook ?? Object.values(bin)[0]) : bin

  if (!script) {
    throw new Error("Storybook's command line couldn't be found")
  }

  return join(dirname(manifestPath), script)
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
