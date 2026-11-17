import { type CanvasDocument, defaultModeSettings, parseCanvasDocument, projectFileText } from "@parity-app/core"
import { createProjectDoc, createProjectSaver, type DocBackend } from "@parity-app/multiplayer"
import { plainProvider } from "@parity-app/multiplayer/testing"
import { describe, expect, it } from "vite-plus/test"
import { openLoro } from "./backend.ts"

/*
 * A copy that takes over a live room saves the project file as the copy that opened it from disk would (PAR-1288). Its
 * document comes from the room, where a design's keyed values (a component's props, a design's params) don't keep the
 * file's order, so the save has to put them back.
 */

/** A project file as a person might have it: keys in their own order, not the order Parity writes them in. */
const onDisk = `${JSON.stringify(
  {
    version: 4,
    containers: [
      {
        id: "profile",
        name: "Profile",
        kind: "component",
        frames: { desktop: { width: 743, height: 80 } },
        position: { x: 0, y: 0 },
        root: {
          id: "root",
          style: { padding: { step: 6 } },
          type: "layout",
          children: [
            {
              id: "save",
              type: "component",
              component: "shadcn/Button",
              props: { children: "Save changes", className: "w-full sm:w-auto", variant: "destructive" }
            },
            { id: "title", type: "text", text: "Avery Chen" }
          ]
        },
        params: {
          initials: { type: "text", default: "AC" },
          name: { type: "text", default: "Avery Chen" },
          email: { type: "text", default: "avery@acme.com" },
          lastActive: { type: "text", default: "Active now" }
        }
      }
    ]
  },
  null,
  2
)}\n`

/** Saves through `backend` and returns the text written, as the app writes a project file. */
async function saveThrough(backend: DocBackend, options: { takeOver: boolean }): Promise<string> {
  const written: string[] = []
  const doc = createProjectDoc(backend, { undoLimit: 200, main: "app.par" })
  const opened = parseCanvasDocument(JSON.parse(onDisk))

  const saver = createProjectSaver(
    doc,
    {
      saveDocument: async (_path, document: CanvasDocument) => {
        // As the app writes it: checked, then in the order the file on disk has.
        written.push(projectFileText(parseCanvasDocument(document), onDisk))
      },
      deleteDocument: async () => undefined,
      autosave: () => false
    },
    options.takeOver
      ? { writesFiles: false, saved: { files: new Map([["app.par", opened]]), modes: defaultModeSettings } }
      : {}
  )

  const result = doc.transact(
    "Rename",
    [{ op: "set", design: "app.par#profile", node: "title", path: ["text"], value: "Jordan Patel" }],
    { origin: "edit" }
  )

  expect(result.ok).toBe(true)

  if (options.takeOver) {
    await saver.setWritesFiles(true)
  } else {
    await saver.flush()
  }

  expect(written).toHaveLength(1)

  return written[0]!
}

describe("a copy that takes over a live room", () => {
  const files = () => [{ path: "app.par", document: parseCanvasDocument(JSON.parse(onDisk)) }]
  const options = () => ({ files: files(), main: "app.par", modes: defaultModeSettings })

  it("saves the file as the copy that opened it does, with only the edit changed", async () => {
    const alone = await saveThrough(plainProvider.open(options()), { takeOver: false })
    const host = openLoro(options())
    const guest = openLoro(options(), host.snapshot())
    const tookOver = await saveThrough(guest, { takeOver: true })

    expect(tookOver).toBe(alone)
  })

  it("changes only the edited line of the file", async () => {
    const host = openLoro(options())
    const guest = openLoro(options(), host.snapshot())
    const before = onDisk.split("\n")
    const after = (await saveThrough(guest, { takeOver: true })).split("\n")
    const changed = after.flatMap((line, at) => (line === before[at] ? [] : [line.trim()]))

    expect(after).toHaveLength(before.length)
    expect(changed).toEqual([`"text": "Jordan Patel"`])
  })
})
