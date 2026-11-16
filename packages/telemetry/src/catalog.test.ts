import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import {
  catalogEnd,
  catalogEvent,
  catalogStart,
  defineEvent,
  registeredEvents,
  renderCatalog,
  withCatalog
} from "./index.ts"

const page = fileURLToPath(new URL("../../../docs/telemetry.md", import.meta.url))

const commandRan = defineEvent(
  "command.ran",
  z.object({
    action: z.string().describe("The action's ID in actions.ts"),
    source: z.enum(["key", "menu"]).describe("Where it came from"),
    durationMs: z.number().int().describe("How long it took"),
    layers: z.array(z.string()).optional().describe("The layers selected"),
    target: z.object({ design: z.string().describe("The design's ID") }).describe("What it acted on"),
    note: z.string().nullable().describe("Free text, with a | in it")
  }),
  { level: "info", sentBy: ["renderer"], when: "An action runs, from any source." }
)

const appQuit = defineEvent("app.quit", z.object({}), {
  level: "debug",
  sample: 0.25,
  sentBy: ["main", "cli"],
  when: "The app quits."
})

describe("catalogEvent", () => {
  it("lists each attribute with its type, whether it's optional and what it means", () => {
    expect(catalogEvent(commandRan)).toEqual({
      name: "command.ran",
      level: "info",
      sample: 1,
      sentBy: ["renderer"],
      when: "An action runs, from any source.",
      attributes: [
        { name: "action", type: "string", optional: false, meaning: "The action's ID in actions.ts" },
        { name: "source", type: '"key" | "menu"', optional: false, meaning: "Where it came from" },
        { name: "durationMs", type: "integer", optional: false, meaning: "How long it took" },
        { name: "layers", type: "string[]", optional: true, meaning: "The layers selected" },
        { name: "target.design", type: "string", optional: false, meaning: "The design's ID" },
        { name: "note", type: "string | null", optional: false, meaning: "Free text, with a | in it" }
      ]
    })
  })

  it("needs every attribute described", () => {
    const vague = defineEvent("project.opened", z.object({ root: z.string() }), {
      level: "info",
      sentBy: ["service"],
      when: "A project opens."
    })

    expect(() => catalogEvent(vague)).toThrow("project.opened's attribute root doesn't say what it means")
  })

  it("needs a process and a time", () => {
    const schema = z.object({})
    expect(() => catalogEvent(defineEvent("a.b", schema, { level: "info", sentBy: [], when: "Now." }))).toThrow(
      "a.b doesn't say which processes send it"
    )
    expect(() => catalogEvent(defineEvent("a.b", schema, { level: "info", sentBy: ["main"], when: " " }))).toThrow(
      "a.b doesn't say when it's sent"
    )
  })
})

describe("renderCatalog", () => {
  it("writes a table of events by name, then each one's attributes", () => {
    expect(renderCatalog([commandRan, appQuit])).toBe(
      [
        "| Event         | Level | Kept | Sent by   | When                             |",
        "| ------------- | ----- | ---- | --------- | -------------------------------- |",
        "| `app.quit`    | debug | 25%  | main, cli | The app quits.                   |",
        "| `command.ran` | info  | all  | renderer  | An action runs, from any source. |",
        "",
        "### `app.quit`",
        "",
        "No attributes.",
        "",
        "### `command.ran`",
        "",
        "| Attribute       | Type                 | Meaning                       |",
        "| --------------- | -------------------- | ----------------------------- |",
        "| `action`        | `string`             | The action's ID in actions.ts |",
        '| `source`        | `"key" \\| "menu"`    | Where it came from            |',
        "| `durationMs`    | `integer`            | How long it took              |",
        "| `layers`        | `string[]`, optional | The layers selected           |",
        "| `target.design` | `string`             | The design's ID               |",
        "| `note`          | `string \\| null`     | Free text, with a \\| in it    |"
      ].join("\n")
    )
  })

  it("says when nothing is registered", () => {
    expect(renderCatalog([])).toBe("No events are registered yet.")
  })

  it("refuses a name registered twice", () => {
    expect(() => renderCatalog([appQuit, appQuit])).toThrow("app.quit is registered twice")
  })
})

describe("withCatalog", () => {
  it("replaces only the generated part", () => {
    const before = `# Telemetry\n\nBy hand.\n\n${catalogStart}\n\nOld.\n\n${catalogEnd}\n\nAlso by hand.\n`
    expect(withCatalog(before, [appQuit])).toBe(
      `# Telemetry\n\nBy hand.\n\n${catalogStart}\n\n${renderCatalog([appQuit])}\n\n${catalogEnd}\n\nAlso by hand.\n`
    )
  })

  it("refuses a page without the markers", () => {
    expect(() => withCatalog("# Telemetry\n", [])).toThrow("The page has no generated part")
  })
})

describe("docs/telemetry.md", () => {
  it("lists every registered event", async () => {
    const current = await readFile(page, "utf8")
    await expect(withCatalog(current, registeredEvents)).toMatchFileSnapshot(
      page,
      "docs/telemetry.md doesn't match the event registry. Regenerate it with `pnpm exec vp test run packages/telemetry -u` and review the diff"
    )
  })
})
