import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { describe, expect, it } from "vite-plus/test"
import { traceWith } from "../tracing.ts"
import { recordActions } from "./record-actions.ts"

const sink = createTestSink()

traceWith(
  createTelemetry({
    events: registeredEvents,
    context: { process: "renderer", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })
)

const recorded = () => sink.spans.map(({ name, outcome, attributes }) => ({ name, outcome, attributes }))

describe("recordActions", () => {
  it("records each run with where it came from and what was selected, handing on the key that ran it", () => {
    sink.clear()
    const pressed: (string | undefined)[] = []

    const actions = recordActions(
      {
        nudge: {
          run: (event) => {
            pressed.push(event?.key)
          },
          byKey: true
        }
      },
      () => ({ layers: 2, designs: 0 })
    )

    expect(actions.nudge.byKey).toBe(true)
    // SAFETY: `recordActions` hands the event on untouched, and this action reads only its `key`; Node has no
    // KeyboardEvent to construct a real one.
    const press = { key: "ArrowLeft" } as KeyboardEvent
    void actions.nudge.run("key", { event: press })
    expect(pressed).toEqual(["ArrowLeft"])
    expect(recorded()).toEqual([
      {
        name: "command.ran",
        outcome: "ok",
        attributes: { action: "nudge", from: "key", enabled: true, layers: 2, designs: 0 }
      }
    ])
  })

  it("records one tried while it doesn't apply as cancelled, without running it", () => {
    sink.clear()
    let ran = false

    const actions = recordActions(
      {
        paste: {
          run: () => {
            ran = true
          },
          available: () => false
        }
      },
      () => ({ layers: 0, designs: 0 })
    )

    expect(actions.paste.run("key")).toBeUndefined()
    expect(ran).toBe(false)
    expect(recorded()).toEqual([
      {
        name: "command.ran",
        outcome: "cancelled",
        attributes: { action: "paste", from: "key", enabled: false, layers: 0, designs: 0 }
      }
    ])
  })

  it("runs what the caller binds in the action's place, passes on what it returns, tells of each run that applies, and records a failure's code", async () => {
    sink.clear()
    let made = ""
    const failed = Object.assign(new Error("Locked"), { details: { code: "locked" } })
    const heard: string[] = []

    const actions = recordActions(
      {
        newScreen: {
          run: () => {
            made = "in the active tab"
          }
        },
        save: { run: () => Promise.reject(failed) },
        undo: { run: () => undefined, available: () => false }
      },
      () => ({ layers: 0, designs: 1 }),
      (id) => heard.push(id)
    )

    void actions.newScreen.run("canvasMenu", {
      instead: () => {
        made = "where the menu opened"
      }
    })
    expect(made).toBe("where the menu opened")
    await expect(actions.save.run("menu")).rejects.toBe(failed)
    void actions.undo.run("key")
    expect(heard).toEqual(["newScreen", "save"])
    await Promise.resolve()
    expect(recorded().map(({ outcome, attributes }) => ({ outcome, ...attributes }))).toEqual([
      { outcome: "ok", action: "newScreen", from: "canvasMenu", enabled: true, layers: 0, designs: 1 },
      { outcome: "error", action: "save", from: "menu", enabled: true, layers: 0, designs: 1, code: "locked" },
      { outcome: "cancelled", action: "undo", from: "key", enabled: false, layers: 0, designs: 1 }
    ])
  })
})

const renderer = resolve(import.meta.dirname, "..")
const actionsFile = join(import.meta.dirname, "actions.ts")

/** The modules whose functions the actions run, beside this file. */
const commandModules = ["commands.ts", "layout.ts", "create.ts", "QuickInsert.tsx"].map((name) =>
  join(import.meta.dirname, name)
)

const importPattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g

/** The names a file imports from the command modules. */
function importedCommands(file: string, source: string): string[] {
  return [...source.matchAll(importPattern)]
    .filter(([, , from]) => commandModules.includes(resolve(dirname(file), from!)))
    .flatMap(([, names]) => names!.split(",").map((name) => name.trim().replace(/^type\s+/, "")))
    .filter(Boolean)
}

/** The window's own source files, not tests, stories or design explorations. */
function windowFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)

    if (entry.isDirectory()) {
      return entry.name === "explorations" || entry.name === "stories" ? [] : windowFiles(path)
    }

    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe("the action list", () => {
  it("is the only way the window runs an action's command, so every one is recorded", () => {
    // What the actions run, not what they ask: `activeSession` and the `selected…` queries are for `available`.
    const commands = new Set(
      importedCommands(actionsFile, readFileSync(actionsFile, "utf8")).filter(
        (name) => name !== "activeSession" && !name.startsWith("selected")
      )
    )

    expect(commands).toContain("alignSelection")

    const bypasses = windowFiles(renderer)
      .filter((file) => file !== actionsFile && !commandModules.includes(file))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8")

        const body = source
          .replace(importPattern, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "")

        return importedCommands(file, source)
          .filter((name) => commands.has(name))
          .flatMap((name) => {
            // Called, or passed on as a handler. One bound to where it was asked for runs in the action's place,
            // through `instead`, which drops what it returns when that isn't an action's result.
            const used = new RegExp(`(?<![\\w.])${name}(?=\\s*\\()|(?<=[{(,=]\\s*)${name}(?=\\s*[}),])`, "g")
            const uses = body.match(used)?.length ?? 0
            const instead = body.match(new RegExp(`instead: \\(\\) => (?:void )?${name}\\(`, "g"))?.length ?? 0

            return uses > instead ? [`${relative(renderer, file)} runs ${name} without actions.ts`] : []
          })
      })

    expect(bypasses).toEqual([])
  })
})
