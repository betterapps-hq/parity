import type { ComponentSource } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { ProjectSession } from "../workspace.ts"
import { componentFile } from "./code-editor.ts"

/** Just what `componentFile` reads of a project. */
function project(root: string, sources: Record<string, ComponentSource>): ProjectSession {
  // SAFETY: `componentFile` and `projectFile` read only `info.root` and `info.sources`, which this sets.
  return { info: { root, sources } } as ProjectSession
}

describe("a component's code", () => {
  it("is the project's own component's file, from the root", () => {
    const session = project("D:\\shop", { Button: { path: "src/components/ui/button.tsx", export: "Button" } })
    expect(componentFile(session, "Button")).toBe("D:\\shop\\src\\components\\ui\\button.tsx")
    const posix = project("/home/ada/shop/", { Button: { path: "./src/button.tsx", export: "Button" } })
    expect(componentFile(posix, "Button")).toBe("/home/ada/shop/src/button.tsx")
  })

  it("is a library component's type declarations, and none without them", () => {
    const session = project("/shop", {
      "radix/Dialog.Root": {
        path: "@radix-ui/react-dialog",
        export: "Dialog.Root",
        library: "radix",
        declaration: "node_modules/@radix-ui/react-dialog/dist/index.d.ts"
      },
      "kit/Card": { path: "@kit/ui", export: "Card", library: "kit" }
    })

    expect(componentFile(session, "radix/Dialog.Root")).toBe(
      "/shop/node_modules/@radix-ui/react-dialog/dist/index.d.ts"
    )
    expect(componentFile(session, "kit/Card")).toBeUndefined()
    expect(componentFile(session, "Missing")).toBeUndefined()
  })
})
