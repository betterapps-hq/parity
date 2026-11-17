import { describe, expect, it } from "vite-plus/test"
import { withPackageChanges } from "./setup-plan.ts"

describe("withPackageChanges", () => {
  const before = `{
    "name": "app",
    "scripts": { "dev": "vite", "postinstall": "husky" },
    "dependencies": { "react": "^19.0.0", "zod": "^4.0.0" }
}
`

  it("adds dependencies in name order and replaces scripts where they are, keeping the file's indentation", () => {
    const after = withPackageChanges(before, {
      dependencies: { "lucide-react": "^1.0.0" },
      devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" },
      scripts: { postinstall: "husky && shadcn-sync sync", build: "vite build" }
    })

    expect(JSON.parse(after)).toEqual({
      name: "app",
      scripts: { dev: "vite", postinstall: "husky && shadcn-sync sync", build: "vite build" },
      dependencies: { "lucide-react": "^1.0.0", react: "^19.0.0", zod: "^4.0.0" },
      devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" }
    })
    expect(Object.keys(JSON.parse(after).dependencies)).toEqual(["lucide-react", "react", "zod"])
    expect(after).toMatch(/^\{\n {4}"name": "app",\n/)
    expect(after.endsWith("}\n")).toBe(true)
  })

  it("replaces a dependency's range, keeps CRLF line ends, and refuses what isn't a package.json", () => {
    const after = withPackageChanges('{\r\n  "dependencies": { "react": "^18.0.0" }\r\n}', {
      dependencies: { react: "^19.0.0" }
    })

    expect(after).toBe('{\r\n  "dependencies": {\r\n    "react": "^19.0.0"\r\n  }\r\n}')
    expect(() => withPackageChanges('{ "scripts": [] }', {})).toThrow(/scripts/)
  })

  it("removes a script set to null, keeping the rest where they are", () => {
    const after = withPackageChanges(before, { scripts: { postinstall: null } })

    expect(JSON.parse(after).scripts).toEqual({ dev: "vite" })
  })
})
