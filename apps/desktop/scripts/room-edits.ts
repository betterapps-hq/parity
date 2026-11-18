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
    }, "/workspace.ts")
  }
}

/** Each edit made 20 times in `mover`, a quarter of a second apart, timed to the first frame `watcher` draws with it. */
export async function editsToScreen(mover: Page, watcher: Page): Promise<EditTimes[]> {
  const target = await targetOf(mover)
  const results: EditTimes[] = []

  for (const kind of editKinds) {
    const times: EditTimes = { edit: kind, toScreen: [], arrivedToScreen: [] }

    for (let count = 0; count < 20; count += 1) {
      const seen = await watcher.evaluate(() => window.roomPerfShown!.length)
      const made = await edit(mover, kind, target, count)
      const shown = await nextShown(watcher, seen)

      if (shown) {
        times.toScreen.push(shown.shown - made)
        times.arrivedToScreen.push(shown.shown - shown.arrived)
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

    while (!document.querySelector(".tl-canvas .tl-shape")) {
      await new Promise((done) => setTimeout(done, 10))
    }

    return performance.now() - began
  })

  await cdp.detach()

  return { ms, snapshotBytes }
}

async function targetOf(page: Page): Promise<Target> {
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

    throw new Error("No design has a layout and a text layer")
  })
}

/** Makes one edit of `kind` in the page's document, returning when, in milliseconds since the epoch. */
async function edit(page: Page, kind: string, target: Target, count: number): Promise<number> {
  return page.evaluate(
    ([kind, target, count]) => {
      const doc = window.roomPerfDoc!
      const { position } = doc.design(target.key)!

      const ops = (): Parameters<typeof doc.transact>[1] => {
        switch (kind) {
          case "board drag":
            return [
              { op: "setDesign", design: target.key, path: ["position"], value: { x: position.x + 4, y: position.y } }
            ]
          case "style change":
            return [
              {
                op: "set",
                design: target.key,
                node: target.layer,
                path: ["style", "gap"],
                value: { step: 10 + (count % 2) }
              }
            ]
          case "typing":
            return [
              {
                op: "editText",
                design: target.key,
                node: target.text,
                edit: { kind: "splice", at: 0, remove: 0, insert: "x" }
              }
            ]
          default:
            return [
              {
                op: "setTokens",
                tokens: new Map([
                  ["primary light", { name: "primary", theme: "light", value: `oklch(0.5 0.1 ${count % 360})` }]
                ])
              }
            ]
        }
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
