import { describe, expect, it } from "vite-plus/test"
import { componentFile } from "./code-editor.ts"

describe("a component's code", () => {
  it("is the project's own component's file, from the root", () => {
    const shop = { root: "D:\\shop", sources: { Button: { path: "src/components/ui/button.tsx", export: "Button" } } }
    expect(componentFile(shop, "Button")).toBe("D:\\shop\\src\\components\\ui\\button.tsx")
    const posix = { root: "/home/ada/shop/", sources: { Button: { path: "./src/button.tsx", export: "Button" } } }
    expect(componentFile(posix, "Button")).toBe("/home/ada/shop/src/button.tsx")
  })

  it("is a library component's type declarations, and none without them", () => {
    const shop = {
      root: "/shop",
      sources: {
        "radix/Dialog.Root": {
          path: "@radix-ui/react-dialog",
          export: "Dialog.Root",
          library: "radix",
          declaration: "node_modules/@radix-ui/react-dialog/dist/index.d.ts"
        },
        "kit/Card": { path: "@kit/ui", export: "Card", library: "kit" }
      }
    }

    expect(componentFile(shop, "radix/Dialog.Root")).toBe("/shop/node_modules/@radix-ui/react-dialog/dist/index.d.ts")
    expect(componentFile(shop, "kit/Card")).toBeUndefined()
    expect(componentFile(shop, "Missing")).toBeUndefined()
  })
})
