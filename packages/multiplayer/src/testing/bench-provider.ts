import { defaultModeSettings } from "@parity-app/core"
import { expect, test } from "vite-plus/test"
import { containerOps } from "../diff-ops.ts"
import { createProjectDoc } from "../project-doc.ts"
import type { DocProvider } from "../types.ts"
import { firstChild, generateProject, projectSizes } from "./generate-project.ts"
import type { ReplicaPair } from "./replicas.ts"

const runOptions = { iterations: 5, time: 1000 }

/**
 * The scenarios only a provider has, as Vitest benches: comparing with `containerOps` against sending the operation,
 * and, with a `ReplicaPair`, exchanging transactions with a replica.
 */
export function benchProvider(provider: DocProvider, options: { replicas?: ReplicaPair } = {}): void {
  for (const [size, projectSize] of Object.entries(projectSizes)) {
    const files = generateProject(projectSize)
    const target = files[0]!.document.containers.at(-1)!
    const key = `${files[0]!.path}#${target.id}`
    const layer = firstChild(target)

    test(`${size}: comparing on a one-field change, against sending the operation`, async ({ bench }) => {
      const doc = createProjectDoc(provider.open({ files, main: files[0]!.path, modes: defaultModeSettings }), {
        undoLimit: 200,
        main: files[0]!.path
      })

      let flip = false

      const name = () => {
        flip = !flip

        return flip ? "Renamed" : "Named"
      }

      const result = await bench.compare(
        bench(`${size}: compare`, () => {
          const before = doc.design(key)!
          const value = name()
          const after = { ...before, name: value }
          doc.transact("Rename", containerOps(key, before, after), { origin: "edit" })
        }),
        bench(`${size}: send`, () => {
          doc.transact("Rename", [{ op: "setDesign", design: key, path: ["name"], value: name() }], { origin: "edit" })
        }),
        runOptions
      )

      expect(result.get(`${size}: send`)).toBeDefined()
    })

    test.skipIf(!options.replicas)(`${size}: exchange 1,000 transactions with a replica`, async ({ bench }) => {
      const pair = options.replicas!.open({ files, main: files[0]!.path, modes: defaultModeSettings })

      const result = await bench(`${size}: exchange`, () => {
        for (let index = 0; index < 1000; index += 1) {
          pair.a.apply([{ op: "set", design: key, node: layer, path: ["name"], value: `Edit ${index}` }], "edit")
        }

        pair.exchange()
      }).run(runOptions)

      expect(result.latency.mean).toBeGreaterThan(0)
    })
  }
}
