import { writeFile } from "node:fs/promises"
// What room-perf.ts measures of the document in a live room (PAR-1325): edit to screen, the watching copy's frames while
// the other drags a board, and joining again. Each page's document is reached through the app's own workspace module,
// as Vite serves it, and the watching copy's room measures each change it takes in, from arriving to its frame, as
// `room.changeToScreen`.
import type { DesignNode } from "@parity-app/core"
import type { ProjectDoc } from "@parity-app/multiplayer"
import type { Page } from "playwright-core"
import type { Workspace } from "../src/renderer/workspace.ts"

declare global {
  interface Window {
    roomPerfWorkspace?: Workspace
    roomPerfDoc?: ProjectDoc
    /** The room's measures of others' changes, from arriving to their frame, in the page's own time. */
    roomPerfShown?: { start: number; duration: number }[]
    roomPerfDrag?: { frames: number[]; tasks: number[]; running: boolean }
    /** Starts watching a design's board, or the whole canvas, for changes in it and in its frames. */
    roomPerfWatch?: (key: string | undefined) => boolean
    /** When the watched board last changed, in milliseconds since the epoch. */
    roomPerfLast?: number
  }
}

export const editKinds = ["board drag", "style change", "typing", "token change"] as const

/** A design in the middle of the project, with a layout to style and a text layer to type into. */
interface Target {
  key: string
  layer: string
  text: string
}

export interface EditTimes {
  edit: string
  /** From the edit in one copy to the first frame the other draws with it, in milliseconds. */
  toScreen: number[]
  /** The watching copy's share: from the change arriving to that frame. */
  arrivedToScreen: number[]
  /**
   * From the edit to the last change in the board's frames that it caused, or anywhere on the canvas for a token
   * change: what a person sees settle. A change made only to a stylesheet isn't seen, so it counts as the first frame.
   */
  toFrame: number[]
}

export interface DragTimes {
  frames: number[]
  longTasks: number[]
  changes: number
}

/** Gives each page `roomPerfDoc` and starts collecting its room's `room.changeToScreen` measures. */
export async function withDocs(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.evaluate(async (url) => {
      // SAFETY: the URL is the app's own workspace.ts, as Vite serves it, which exports `workspace`.
      const { workspace } = (await import(url)) as { workspace: Workspace }
      window.roomPerfWorkspace = workspace
      Object.defineProperty(window, "roomPerfDoc", {
        get: () => workspace.getProject()?.session?.doc,
        configurable: true
      })
      const shown: { start: number; duration: number }[] = []
      window.roomPerfShown = shown

      new PerformanceObserver((list) => {
        for (const entry of list.getEntriesByName("room.changeToScreen")) {
          shown.push({ start: entry.startTime, duration: entry.duration })
        }
      }).observe({ type: "measure" })

      let observer: MutationObserver | undefined

      window.roomPerfWatch = (key) => {
        observer?.disconnect()
        window.roomPerfLast = undefined

        const scope = key
          ? document.querySelector(`.container-view[data-design="${CSS.escape(key)}"]`)
          : document.querySelector(".tl-canvas")

        if (!scope) {
          return false
        }

        const options = { subtree: true, childList: true, attributes: true, characterData: true }
        const watched = new WeakSet<ShadowRoot>()

        // Frames draw in shadow roots, which an observer of the page doesn't see into.
        const intoFrames = (root: Node) => {
          if (!(root instanceof Element)) {
            return
          }

          for (const host of [root, ...root.querySelectorAll("[data-frame]")]) {
            if (host.shadowRoot && !watched.has(host.shadowRoot)) {
              watched.add(host.shadowRoot)
              observer!.observe(host.shadowRoot, options)
            }
          }
        }

        observer = new MutationObserver((records) => {
          window.roomPerfLast = performance.timeOrigin + performance.now()

          for (const record of records) {
            record.addedNodes.forEach(intoFrames)
          }
        })

        observer.observe(scope, options)
        intoFrames(scope)

        return true
      }
    }, "/workspace.ts")
  }
}

/** Each edit made 20 times in `mover`, a quarter of a second apart, timed to the first frame `watcher` draws with it. */
export async function editsToScreen(
  mover: Page,
  watcher: Page,
  kinds: readonly (typeof editKinds)[number][] = editKinds
): Promise<EditTimes[]> {
  const target = await targetOf(mover)
  const results: EditTimes[] = []

  if (target) {
    await inView(watcher, target.key)
  }

  for (const kind of kinds) {
    const times: EditTimes = { edit: kind, toScreen: [], arrivedToScreen: [], toFrame: [] }

    // A project drawn only from code has no design to edit, but its tokens can still change.
    if (!target && kind !== "token change") {
      continue
    }

    for (let count = 0; count < 20; count += 1) {
      const seen = await watcher.evaluate(
        (key) => {
          if (!window.roomPerfWatch!(key)) {
            throw new Error(`The watching copy has no board for ${key ?? "the canvas"} to watch`)
          }

          return window.roomPerfShown!.length
        },
        kind === "token change" ? undefined : target?.key
      )

      const made = await edit(mover, kind, target, count)
      const shown = await nextShown(watcher, seen)

      if (shown) {
        times.toScreen.push(shown.shown - made)
        times.arrivedToScreen.push(shown.shown - shown.arrived)
        const settled = await settledAt(watcher)
        times.toFrame.push(Math.max(shown.shown, settled ?? 0) - made)
      }

      await mover.waitForTimeout(250)
    }

    if (times.toScreen.length === 0) {
      throw new Error(`The watching copy never drew the ${kind}`)
    }

    results.push(times)
  }

  return results
}

/** `mover` drags a board for `seconds`, writing it every frame in one gesture, while `watcher` records its frames. */
export async function remoteDrag(mover: Page, watcher: Page, seconds: number): Promise<DragTimes> {
  const target = await targetOf(mover)

  if (!target) {
    throw new Error("The project has no design to drag")
  }

  await inView(watcher, target.key)

  const before = await watcher.evaluate(() => window.roomPerfShown!.length)

  await watcher.evaluate(() => {
    const state: NonNullable<Window["roomPerfDrag"]> = { frames: [], tasks: [], running: true }
    window.roomPerfDrag = state

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.tasks.push(entry.duration)
      }
    })

    observer.observe({ type: "longtask" })
    let last = performance.now()

    const frame = (now: number) => {
      if (!state.running) {
        observer.disconnect()

        return
      }

      state.frames.push(now - last)
      last = now
      requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame)
  })

  await mover.evaluate(
    async ([key, seconds]) => {
      const doc = window.roomPerfDoc!
      const gesture = doc.beginGesture()
      const start = doc.design(key)!.position
      const began = performance.now()

      await new Promise<void>((done) => {
        const frame = (now: number) => {
          const t = (now - began) / 1000
          const position = { x: start.x + Math.sin(t * Math.PI) * 400, y: start.y + t * 20 }
          doc.transact("Move", [{ op: "setDesign", design: key, path: ["position"], value: position }], {
            origin: "edit",
            gesture
          })

          if (t < seconds) {
            requestAnimationFrame(frame)
          } else {
            done()
          }
        }

        requestAnimationFrame(frame)
      })

      doc.endGesture(gesture)
    },
    [target.key, seconds] as const
  )

  await watcher.waitForTimeout(500)

  const watched = await watcher.evaluate(() => {
    const state = window.roomPerfDrag!
    state.running = false

    return { frames: state.frames.slice(1), tasks: state.tasks, shown: window.roomPerfShown!.length }
  })

  return { frames: watched.frames, longTasks: watched.tasks, changes: watched.shown - before }
}

/** The page closes the project and opens it again, on the host's snapshot, timed to its first board on the canvas. */
export async function joinAgain(page: Page): Promise<{ ms: number; snapshotBytes: number }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Network.enable")
  let snapshotBytes = 0

  cdp.on("Network.eventSourceMessageReceived", ({ data }) => {
    if (data.startsWith('{"kind":"snapshot"')) {
      snapshotBytes = Math.max(snapshotBytes, data.length)
    }
  })

  const ms = await page.evaluate(async () => {
    const workspace = window.roomPerfWorkspace!
    const root = workspace.getProject()!.id
    await workspace.close()

    while (document.querySelector(".tl-canvas")) {
      await new Promise((done) => setTimeout(done, 25))
    }

    const began = performance.now()
    void workspace.open(root)

    // Until a board shows what's in it, as perf.ts counts a frame drawn: its design drawn live, or its picture shown. A
    // board's shape comes before either.
    const drawn = (host: Element) =>
      Boolean(host.closest("[data-bitmap], [data-asleep]") ?? host.shadowRoot?.querySelector("[data-canvas-node]"))

    while (![...document.querySelectorAll("[data-frame]")].some(drawn) && !document.querySelector("[data-bitmap]")) {
      if (performance.now() - began > 120_000) {
        throw new Error("No board showed what's in it within two minutes of opening again")
      }

      await new Promise((done) => setTimeout(done, 10))
    }

    return performance.now() - began
  })

  await cdp.detach()

  return { ms, snapshotBytes }
}

async function targetOf(page: Page): Promise<Target | undefined> {
  return page.evaluate(() => {
    const doc = window.roomPerfDoc!
    const keys = [...doc.files()].flatMap(([path, file]) => file.containers.map((design) => `${path}#${design.id}`))

    for (const key of [...keys.slice(Math.floor(keys.length / 2)), ...keys]) {
      const root = doc.design(key)!.root
      const all: DesignNode[] = []

      const visit = (node: DesignNode) => {
        all.push(node)

        if ("children" in node) {
          node.children.forEach(visit)
        }
      }

      visit(root)
      const layer = all.find((node) => node !== root && node.type === "layout")
      const text = all.find((node) => node.type === "text")

      if (layer && text) {
        return { key, layer: layer.id, text: text.id }
      }
    }

    return undefined
  })
}

/** Makes one edit of `kind` in the page's document, returning when, in milliseconds since the epoch. */
async function edit(page: Page, kind: string, target: Target | undefined, count: number): Promise<number> {
  return page.evaluate(
    ([kind, target, count]) => {
      const doc = window.roomPerfDoc!

      const ops = (): Parameters<typeof doc.transact>[1] => {
        if (kind === "token change" || !target) {
          return [
            {
              op: "setTokens",
              tokens: new Map([
                ["primary light", { name: "primary", theme: "light", value: `oklch(0.5 0.1 ${count % 360})` }]
              ])
            }
          ]
        }

        if (kind === "board drag") {
          const { position } = doc.design(target.key)!

          return [
            { op: "setDesign", design: target.key, path: ["position"], value: { x: position.x + 4, y: position.y } }
          ]
        }

        if (kind === "style change") {
          return [
            {
              op: "set",
              design: target.key,
              node: target.layer,
              path: ["style", "gap"],
              value: { step: 10 + (count % 2) }
            }
          ]
        }

        return [
          {
            op: "editText",
            design: target.key,
            node: target.text,
            edit: { kind: "splice", at: 0, remove: 0, insert: "x" }
          }
        ]
      }

      const at = performance.timeOrigin + performance.now()
      const result = doc.transact(kind, ops(), { origin: "edit" })

      if (!result.ok) {
        throw new Error(`The ${kind} was refused: ${JSON.stringify(result)}`)
      }

      return at
    },
    [kind, target, count] as const
  )
}

/**
 * Brings `key`'s board into view in the page at 100% and waits until one of its frames draws live: a board out of view
 * or asleep draws nothing for an edit, which would time as fast as nothing. Frames of a board wider than the window
 * stay asleep until they come near it, so only one is waited for.
 */
async function inView(page: Page, key: string): Promise<void> {
  await page.evaluate(async (key) => {
    const editor = window.roomPerfWorkspace!.getProject()!.session!.editor!
    const board = editor.getCurrentPageShapes().find((each) => "key" in each.props && each.props.key === key)
    const bounds = board && editor.getShapePageBounds(board)

    if (!bounds) {
      throw new Error(`The watching copy has no board for ${key}`)
    }

    editor.setCamera({ ...editor.getCamera(), z: 1 }, { immediate: true })
    editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })

    const live = () => {
      const board = document.querySelector(`.container-view[data-design="${CSS.escape(key)}"]`)
      const frames = board ? [...board.querySelectorAll("[data-frame]")] : []

      return frames.some(
        (host) => !host.closest("[data-asleep], [data-away]") && host.shadowRoot?.querySelector("[data-canvas-node]")
      )
    }

    const began = performance.now()

    while (!live()) {
      if (performance.now() - began > 30_000) {
        throw new Error(`No frame of ${key}'s board drew live within 30 s of coming into view`)
      }

      await new Promise((done) => setTimeout(done, 50))
    }
  }, key)

  // Settled, so what it draws as it wakes isn't counted as the first edit's.
  await page.waitForTimeout(1000)
}

/** Waits until the watched board has been still for 400 ms, at most 5 s, returning when it last changed. */
async function settledAt(page: Page): Promise<number | undefined> {
  return page.evaluate(async () => {
    const began = Date.now()

    while (Date.now() - began < 5000) {
      const last = window.roomPerfLast

      if (performance.timeOrigin + performance.now() - (last ?? began) >= 400) {
        break
      }

      await new Promise((done) => setTimeout(done, 50))
    }

    return window.roomPerfLast
  })
}

/** Waits for the page to draw a change after the first `seen`, returning its arrival and frame since the epoch. */
async function nextShown(page: Page, seen: number): Promise<{ arrived: number; shown: number } | undefined> {
  const handle = await page
    .waitForFunction(
      (seen) => {
        const entry = window.roomPerfShown![seen]

        return (
          entry && {
            arrived: performance.timeOrigin + entry.start,
            shown: performance.timeOrigin + entry.start + entry.duration
          }
        )
      },
      seen,
      { timeout: 5000 }
    )
    .catch(() => undefined)

  return handle ? ((await handle.jsonValue()) ?? undefined) : undefined
}

interface ProfileNode {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  children?: number[]
}

interface CpuProfile {
  nodes: ProfileNode[]
  samples?: number[]
  timeDeltas?: number[]
}

/** Where the page's main thread spent its time while `run` ran: by function, its own time and with what it called. */
export interface ProfileSummary {
  sampledMs: number
  /** The functions that took the most time themselves, in milliseconds. */
  self: { name: string; ms: number }[]
  /** The functions that took the most time with everything they called, in milliseconds. */
  total: { name: string; ms: number }[]
}

/** Runs `run` while sampling `page`'s JavaScript, saving the profile to `file` and summing it by function. */
export async function profiled<T>(
  page: Page,
  file: string,
  run: () => Promise<T>
): Promise<{ result: T; profile: ProfileSummary }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Profiler.enable")
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
  await cdp.send("Profiler.start")
  const result = await run()
  const { profile } = await cdp.send("Profiler.stop")
  await cdp.detach()
  await writeFile(file, JSON.stringify(profile))

  return { result, profile: summarize(profile) }
}

function summarize(profile: CpuProfile): ProfileSummary {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const parent = new Map<number, number>()

  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parent.set(child, node.id)
    }
  }

  const nameOf = (node: ProfileNode) => {
    const { functionName, url, lineNumber } = node.callFrame
    const where = url.split("/").pop()?.split("?")[0] ?? ""

    return where ? `${functionName || "(anonymous)"} ${where}:${lineNumber + 1}` : functionName
  }

  const self = new Map<string, number>()
  const total = new Map<string, number>()
  let sampledMs = 0

  const deltas = profile.timeDeltas ?? []

  profile.samples?.forEach((id, index) => {
    const ms = (deltas[index] ?? 0) / 1000
    sampledMs += ms
    const leaf = byId.get(id)!
    self.set(nameOf(leaf), (self.get(nameOf(leaf)) ?? 0) + ms)
    const seen = new Set<string>()

    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const name = nameOf(byId.get(at)!)

      if (!seen.has(name)) {
        seen.add(name)
        total.set(name, (total.get(name) ?? 0) + ms)
      }
    }
  })

  const top = (map: Map<string, number>) =>
    [...map]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }))

  return { sampledMs: Math.round(sampledMs), self: top(self), total: top(total) }
}
