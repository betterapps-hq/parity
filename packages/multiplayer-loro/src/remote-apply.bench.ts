/**
 * What taking in someone else's change costs on the replica that receives it (PAR-1326): one change to a layer's style,
 * the frames of a drag, a board's or a layer's, each one commit, and a layer inserted, which reads its design back whole. Timed by hand around `receive`, which runs
 * `ProjectDoc`'s subscriber too, as the app's room does. Run it as a one-off command:
 *
 *   pnpm exec vp test bench packages/multiplayer-loro/src/remote-apply.bench.ts --testTimeout=600000 \
 *     --execArgv=--external-memory-accounted-in-global-limit
 */
import { defaultModeSettings } from "@parity-app/core"
import { createProjectDoc, type DocOp } from "@parity-app/multiplayer"
import { firstChild, generateProject, projectSizes } from "@parity-app/multiplayer/testing"
import { expect, test } from "vite-plus/test"
import { openLoro } from "./backend.ts"

const frames = 120

const percentile = (sorted: readonly number[], at: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))]!

for (const [size, projectSize] of Object.entries(projectSizes)) {
  test(`${size}: taking in others' changes`, () => {
    const files = generateProject(projectSize)
    const main = files[0]!.path
    const target = files[0]!.document.containers.at(-1)!
    const key = `${main}#${target.id}`
    const layer = firstChild(target)
    const a = openLoro({ files, main, modes: defaultModeSettings })
    const b = openLoro({ files, main, modes: defaultModeSettings }, a.snapshot())
    const doc = createProjectDoc(b, { undoLimit: 200, main })
    let changes = 0

    const stop = doc.subscribe(() => {
      changes += 1
    })

    const time = (op: (frame: number) => DocOp) => {
      const samples: number[] = []

      for (let frame = 0; frame < frames; frame += 1) {
        const since = b.versionVector()
        a.apply([op(frame)], "edit")
        const bytes = a.updates(since)
        const start = performance.now()
        b.receive(bytes)
        samples.push(performance.now() - start)
      }

      // The first few warm up.
      const kept = samples.slice(10).toSorted((x, y) => x - y)
      const mean = kept.reduce((sum, each) => sum + each, 0) / kept.length

      return { mean, p50: percentile(kept, 0.5), p95: percentile(kept, 0.95) }
    }

    const rows = {
      "one style change": time((frame) => ({
        op: "set",
        design: key,
        node: layer,
        path: ["style", "opacity"],
        value: { value: (frame % 10) / 10 }
      })),
      "board drag frame": time((frame) => ({
        op: "setDesign",
        design: key,
        path: ["position"],
        value: { x: frame * 3, y: frame * 2 }
      })),
      "layer drag frame": time((frame) => ({
        op: "set",
        design: key,
        node: layer,
        path: ["style", "left"],
        value: { value: frame, unit: "px" }
      })),
      // A tree change, which the events can't say: the design is read back whole.
      "layer insert": time((frame) => ({
        op: "insert",
        design: key,
        parent: target.root.id,
        node: { type: "text", id: `added-${frame}`, text: "Added" }
      }))
    }

    stop()
    console.warn(
      `${size}: ms per receive\n${Object.entries(rows)
        .map(
          ([name, row]) =>
            `  ${name}: mean ${row.mean.toFixed(3)}, p50 ${row.p50.toFixed(3)}, p95 ${row.p95.toFixed(3)}`
        )
        .join("\n")}`
    )

    expect(changes).toBe(frames * 4)
    expect(b.files()).toEqual(a.files())
    doc.dispose()
    a.dispose()
  })
}
