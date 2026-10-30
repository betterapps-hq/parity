import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { iconExports, iconImports } from "./icon-imports.ts"

const index = `
import * as index from './icons/index.mjs';
export { index as icons };
export { default as Plus, default as PlusIcon, default as LucidePlus } from './icons/plus.mjs';
export { default as CircleCheck, default as CheckCircle } from './icons/circle-check.mjs';
export { LucideProvider, useLucideContext } from './context.mjs';
export { default as Icon } from './Icon.mjs';
`
const exports = iconExports(index)
const dist = "lucide-react/dist/esm"

describe("iconExports", () => {
  it("finds every name an icon goes by, and the package's other exports", () => {
    expect(exports.get("Plus")).toEqual({ file: "icons/plus.mjs", name: "default" })
    expect(exports.get("LucidePlus")).toEqual({ file: "icons/plus.mjs", name: "default" })
    expect(exports.get("CheckCircle")).toEqual({ file: "icons/circle-check.mjs", name: "default" })
    expect(exports.get("useLucideContext")).toEqual({ file: "context.mjs", name: "useLucideContext" })
    expect(exports.get("Icon")).toEqual({ file: "Icon.mjs", name: "default" })
    expect(exports.has("icons")).toBe(false)
  })

  it("reads the installed package's index", () => {
    const root = dirname(createRequire(import.meta.url).resolve("lucide-react/package.json"))
    const installed = iconExports(readFileSync(join(root, "dist/esm/lucide-react.mjs"), "utf8"))
    expect(installed.size).toBeGreaterThan(4000)
    expect(installed.get("ChevronDown")).toEqual({ file: "icons/chevron-down.mjs", name: "default" })
  })
})

describe("iconImports", () => {
  it("imports each icon from its own file, under the name the module uses", () => {
    expect(iconImports(`import { Plus, CheckCircle as Done } from "lucide-react"\nPlus`, exports, dist)).toBe(
      `import { default as Plus } from "${dist}/icons/plus.mjs"; ` +
        `import { default as Done } from "${dist}/icons/circle-check.mjs";\nPlus`
    )
  })

  it("keeps the lines below where they were", () => {
    const code = `import {\n  Plus,\n  type LucideProps,\n  Icon\n} from "lucide-react"\nconst a = 1`
    const next = iconImports(code, exports, dist)!
    expect(next.split("\n")).toHaveLength(code.split("\n").length)
    expect(next.split("\n").at(-1)).toBe("const a = 1")
    expect(next).toContain(`import { default as Icon } from "${dist}/Icon.mjs";`)
  })

  it("drops types, and an import that only had types", () => {
    expect(iconImports(`import { type LucideIcon } from "lucide-react";\nx`, exports, dist)).toBe("\nx")
    expect(iconImports(`import type { LucideIcon } from "lucide-react"`, exports, dist)).toBeUndefined()
  })

  it("leaves a name the package doesn't export imported from it, so it fails as before", () => {
    expect(iconImports(`import { Plus, Nope } from "lucide-react"`, exports, dist)).toBe(
      `import { default as Plus } from "${dist}/icons/plus.mjs"; import { Nope } from "lucide-react";`
    )
  })

  it("leaves import-like text in strings and comments as it is", () => {
    const code = `const example = "import { Plus } from 'lucide-react'"\n// import { Plus } from "lucide-react"\n`
    expect(iconImports(code, exports, dist)).toBeUndefined()
    expect(iconImports(`${code}import { Plus } from "lucide-react"`, exports, dist)).toBe(
      `${code}import { default as Plus } from "${dist}/icons/plus.mjs";`
    )
  })

  it("changes nothing in a module that doesn't import lucide-react", () => {
    expect(iconImports(`import { Plus } from "./icons"`, exports, dist)).toBeUndefined()
    expect(iconImports(`import { Plus } from "lucide-react/icons/plus"`, exports, dist)).toBeUndefined()
  })
})
