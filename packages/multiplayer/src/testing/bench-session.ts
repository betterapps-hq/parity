import type { CanvasDocument, ContainerSpec, DesignNode } from "@parity-app/core"
import { afterAll, type Bench, expect, test } from "vite-plus/test"
import { firstChild, firstText, generateProject, type ProjectSize, projectSizes } from "./generate-project.ts"

/** What the benchmark drives: today's DesignStore through an adapter, or ProjectDoc through the functions for callers. */
export interface BenchSession {
  updateContainer(
    key: string,
    label: string,
    update: (container: ContainerSpec) => ContainerSpec,
    gesture?: string
  ): void
  addContainer(path: string, container: ContainerSpec): string
  beginGesture(): string
  endGesture(gesture: string): void
  undo(): void
  redo(): void
  /** The `.par` content of a file, as saving would write it. */
  fileContent(path: string): CanvasDocument | undefined
}

type OpenSession = (files: { path: string; document: CanvasDocument }[]) => BenchSession

/** Each scenario's time, per transaction, frame, character or step, in milliseconds, by project size. */
interface Row {
  size: string
  scenario: string
  unit: string
  ms: number
}

/** How long each scenario runs: at least this many times, and at least this long. */
const runOptions = { iterations: 5, time: 1000 }

/**
 * The benchmark's scenarios against one kind of session, as Vitest benches, one test per project size and scenario.
 * After them it prints a table of the times per unit, and, when Node runs with `--expose-gc`, the memory a session holds.
 */
export function benchSession(open: OpenSession, sizes: Partial<typeof projectSizes> = projectSizes): void {
  const rows: Row[] = []
  const memory: { size: string; measure: string; mb: number }[] = []

  for (const [size, options] of Object.entries(sizes)) {
    benchSize(size, options, open, rows)
    memorySize(size, options, open, memory)
  }

  afterAll(() => {
    const table = rows.map((row) => `| ${row.size} | ${row.scenario} | ${row.ms.toFixed(3)} ms per ${row.unit} |`)
    const held = memory.map((row) => `| ${row.size} | ${row.measure} | ${row.mb.toFixed(1)} MB |`)
    process.stdout.write(`${["| Size | Scenario | Time |", "| --- | --- | --- |", ...table].join("\n")}\n\n`)

    if (held.length > 0) {
      process.stdout.write(`${["| Size | Memory | Heap |", "| --- | --- | --- |", ...held].join("\n")}\n\n`)
    }
  })
}

function benchSize(size: string, options: ProjectSize, open: OpenSession, rows: Row[]): void {
  const files = generateProject(options)
  const main = files[0]!
  const designs = files.flatMap((file) => file.document.containers.map((container) => ({ path: file.path, container })))
  // A screen in the middle of the project, so nothing is first or last.
  const target = designs[Math.floor(designs.length / 2)]!
  const key = `${target.path}#${target.container.id}`
  const layer = firstChild(target.container)
  const text = firstText(target.container)

  const record = async (
    scenario: string,
    unit: string,
    perRun: number,
    run: (session: BenchSession) => void,
    bench: Bench,
    prepare: (session: BenchSession) => void = () => undefined
  ) => {
    const session = open(files)
    prepare(session)
    const result = await bench(`${size}: ${scenario}`, () => run(session)).run(runOptions)
    rows.push({ size, scenario, unit, ms: result.latency.mean / perRun })

    return result.latency.mean
  }

  test(`${size}: open the project`, async ({ bench }) => {
    const result = await bench(`${size}: open the project`, () => {
      open(files)
    }).run(runOptions)

    rows.push({ size, scenario: "Open the project", unit: "open", ms: result.latency.mean })
    expect(result.latency.mean).toBeGreaterThan(0)
  })

  test(`${size}: set one field on one layer`, async ({ bench }) => {
    let flip = false

    const mean = await record(
      "Set one field on one layer",
      "transaction",
      1,
      (session) => {
        flip = !flip
        const name = flip ? "Renamed" : "Named"
        session.updateContainer(key, "Rename layer", (container) =>
          withNode(container, layer, (node) => ({ ...node, name }))
        )
      },
      bench
    )

    expect(mean).toBeGreaterThan(0)
  })

  test(`${size}: a 300-frame drag, then end`, async ({ bench }) => {
    const mean = await record(
      "A 300-frame drag of one design, then end",
      "frame",
      300,
      (session) => {
        const gesture = session.beginGesture()

        for (let frame = 1; frame <= 300; frame += 1) {
          session.updateContainer(
            key,
            "Move frame",
            (container) => ({
              ...container,
              position: { x: target.container.position.x + frame, y: container.position.y }
            }),
            gesture
          )
        }

        session.endGesture(gesture)
      },
      bench
    )

    expect(mean).toBeGreaterThan(0)
  })

  test(`${size}: type 200 characters`, async ({ bench }) => {
    const mean = await record(
      "Type 200 characters into a text layer",
      "character",
      200,
      (session) => {
        for (let typed = 1; typed <= 200; typed += 1) {
          const value = "x".repeat(typed)
          session.updateContainer(key, "Edit text", (container) =>
            withNode(container, text, (node) => (node.type === "text" ? { ...node, text: value } : node))
          )
        }
      },
      bench
    )

    expect(mean).toBeGreaterThan(0)
  })

  test(`${size}: paste 500 layers`, async ({ bench }) => {
    let pasted = false

    const pasteRoot: DesignNode = {
      type: "layout",
      id: "pasted",
      children: Array.from({ length: 500 }, (_, index) => ({
        type: "text" as const,
        id: `pasted-${index}`,
        text: "Pasted"
      }))
    }

    const mean = await record(
      "Paste 500 layers, or take them out again",
      "paste",
      1,
      (session) => {
        pasted = !pasted
        const add = pasted
        session.updateContainer(key, "Paste", (container) => {
          const root = container.root

          if (root.type !== "layout") {
            return container
          }

          const children = add ? [...root.children, pasteRoot] : root.children.filter((child) => child.id !== "pasted")

          return { ...container, root: { ...root, children } }
        })
      },
      bench
    )

    expect(mean).toBeGreaterThan(0)
  })

  test(`${size}: undo and redo 50 steps`, async ({ bench }) => {
    const mean = await record(
      "Undo and redo 50 steps",
      "step",
      100,
      (session) => {
        for (let step = 0; step < 50; step += 1) {
          session.undo()
        }

        for (let step = 0; step < 50; step += 1) {
          session.redo()
        }
      },
      bench,
      (session) => {
        for (let step = 0; step < 50; step += 1) {
          const name = `Step ${step}`
          session.updateContainer(key, "Rename layer", (container) =>
            withNode(container, layer, (node) => ({ ...node, name }))
          )
        }
      }
    )

    expect(mean).toBeGreaterThan(0)
  })

  test(`${size}: save one file`, async ({ bench }) => {
    const mean = await record(
      "Save one file",
      "file",
      1,
      (session) => {
        const content = session.fileContent(main.path)

        if (JSON.stringify(content).length === 0) {
          throw new Error("Nothing to save")
        }
      },
      bench,
      (session) => {
        session.updateContainer(key, "Rename layer", (container) =>
          withNode(container, layer, (node) => ({ ...node, name: "Saved" }))
        )
      }
    )

    expect(mean).toBeGreaterThan(0)
  })
}

/** The heap a session holds once open, and how much it grows over 10,000 edits, read after a forced collection. */
function memorySize(
  size: string,
  options: ProjectSize,
  open: OpenSession,
  memory: { size: string; measure: string; mb: number }[]
): void {
  const collect = globalThis.gc

  test.skipIf(!collect)(`${size}: memory`, () => {
    const heap = () => {
      collect!()
      collect!()

      return process.memoryUsage().heapUsed / 1024 / 1024
    }

    const before = heap()
    const files = generateProject(options)
    const loaded = heap()
    const target = files[0]!.document.containers.at(-1)!
    const key = `${files[0]!.path}#${target.id}`
    const layer = firstChild(target)
    const session = open(files)
    const opened = heap()

    for (let edit = 0; edit < 10_000; edit += 1) {
      const name = `Edit ${edit}`
      session.updateContainer(key, "Rename layer", (container) =>
        withNode(container, layer, (node) => ({ ...node, name }))
      )
    }

    const edited = heap()
    memory.push({ size, measure: "The files' values", mb: loaded - before })
    memory.push({ size, measure: "The session opened on them", mb: opened - loaded })
    memory.push({ size, measure: "10,000 edits", mb: edited - opened })
    // Read from the session after the last measure, so it's still held when it's taken.
    expect(session.fileContent(files[0]!.path)).toBeDefined()
  })
}

/** The design with one layer changed, copying only the layers above it. */
function withNode(container: ContainerSpec, id: string, update: (node: DesignNode) => DesignNode): ContainerSpec {
  const visit = (node: DesignNode): DesignNode => {
    if (node.id === id) {
      return update(node)
    }

    if (!("children" in node)) {
      return node
    }

    const children = node.children.map(visit)

    return children.some((child, index) => child !== node.children[index]) ? { ...node, children } : node
  }

  const root = visit(container.root)

  // SAFETY: `visit` keeps each layer's type, so a root layout stays the root layout it was.
  return root === container.root ? container : { ...container, root: root as ContainerSpec["root"] }
}
