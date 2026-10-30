import { describe, expect, it } from "vite-plus/test"
import { closestVersion, iconWords, manifestText, readIconTags, type TagFetchers } from "./icon-tags.ts"

/** Fetchers that answer from data, recording what was asked. */
function fake(answers: Partial<TagFetchers>, asked: string[] = []): TagFetchers {
  return {
    packageFile: async (name, version, file) => {
      asked.push(`${name}@${version}/${file}`)
      return (await answers.packageFile?.(name, version, file)) ?? ""
    },
    publishedVersions: answers.publishedVersions ?? (async () => []),
    publishedSource: async (name, version) => {
      asked.push(`npm ${name}@${version}`)
      return (await answers.publishedSource?.(name, version)) ?? {}
    },
    repositoryFiles: async (repo, commit, matches) => {
      asked.push(`${repo}@${commit} ${matches.source}`)
      return (await answers.repositoryFiles?.(repo, commit, matches)) ?? []
    }
  }
}

/** Icons named `Icon0` to `Icon<count - 1>`, as a set like Tabler's exports them. */
function numbered(count: number): { label: string; names: string[] }[] {
  return Array.from({ length: count }, (_, index) => ({ label: `Icon${index}`, names: [`Icon${index}`] }))
}

describe("readIconTags", () => {
  const lucideTags = JSON.stringify({
    "circle-alert": ["warning", "Danger "],
    settings: ["cog", "gear"],
    unused: ["x"]
  })

  it("keys a companion package's tags by each icon's label, through any name it's exported under", async () => {
    const asked: string[] = []
    const found = await readIconTags(
      { package: "lucide-static", file: "tags.json" },
      { name: "lucide-react", version: "1.63.0" },
      [
        { label: "AlertCircle", names: ["AlertCircle", "CircleAlert", "CircleAlertIcon"] },
        { label: "Settings", names: ["Settings", "SettingsIcon"] },
        { label: "Heart", names: ["Heart"] }
      ],
      fake(
        { packageFile: async () => lucideTags, publishedVersions: async () => ["1.62.0", "1.63.0", "1.64.0"] },
        asked
      )
    )
    expect(asked).toEqual(["lucide-static@1.63.0/tags.json"])
    expect(found.tags).toEqual({ AlertCircle: ["warning", "danger"], Settings: ["cog", "gear"] })
    expect(found.matched).toBe(2)
    expect(found.source).toBe("lucide-static@1.63.0/tags.json")
  })

  it("reads a module's declarations as data, without running it", async () => {
    const module = `const e = ((i) => (i.NATURE = "nature", i.OFFICE = "office", i))(e || {});
const n = [
  { name: "acorn", pascal_name: "Acorn", categories: [e.NATURE], tags: ["*new*", "nut", "oak"], codepoint: 60314 },
  { name: "gear", pascal_name: "Gear", categories: [e.OFFICE], tags: ["settings", "cog"], codepoint: 60315 }
];
globalThis.ran = true;
export { n as icons };`
    const found = await readIconTags(
      { package: "@phosphor-icons/core", file: "dist/index.mjs" },
      { name: "@phosphor-icons/react", version: "2.1.10" },
      [
        { label: "Acorn", names: ["Acorn", "AcornIcon"] },
        { label: "Gear", names: ["Gear", "GearIcon"] }
      ],
      fake({ packageFile: async () => module, publishedVersions: async () => ["2.1.1"] })
    )
    // Tags tell icons apart more than categories do, so they come first; `*new*` marks a release, not the icon.
    expect(found.tags).toEqual({ Acorn: ["nut", "oak", "nature"], Gear: ["settings", "cog", "office"] })
    expect(found.source).toBe("@phosphor-icons/core@2.1.1/dist/index.mjs")
    expect("ran" in globalThis).toBe(false)
  })

  it("reads files about one icon each from the repository and commit npm records", async () => {
    const asked: string[] = []
    const icons = Array.from({ length: 10 }, (_, index) => ({
      label: `Shape${index}`,
      names: [`Shape${index}Regular`, `Shape${index}24Filled`]
    }))
    const found = await readIconTags(
      { files: "assets/*/metadata.json" },
      { name: "@fluentui/react-icons", version: "2.0.344" },
      icons,
      fake(
        {
          publishedSource: async () => ({
            repository: "https://github.com/microsoft/fluentui-system-icons",
            commit: "f1260014e8a4fcfa6777182fd6cf082fc5e952d8"
          }),
          repositoryFiles: async () =>
            icons.map((_, index) => ({
              path: `assets/Shape ${index}/metadata.json`,
              text: JSON.stringify({
                name: `Shape ${index}`,
                size: [20, 24],
                style: ["Regular", "Filled"],
                keyword: "fluent-icon",
                metaphor: [`metaphor ${index}`]
              })
            }))
        },
        asked
      )
    )
    expect(asked).toEqual([
      "npm @fluentui/react-icons@2.0.344",
      "https://github.com/microsoft/fluentui-system-icons@f1260014e8a4fcfa6777182fd6cf082fc5e952d8 ^assets\\/[^/]+\\/metadata\\.json$"
    ])
    // Every icon comes in both styles and has the same keyword, so neither says anything about one.
    expect(found.tags.Shape3).toEqual(["metaphor 3"])
    expect(found.matched).toBe(10)
    expect(found.source).toBe("github.com/microsoft/fluentui-system-icons@f1260014e8a4/assets/*/metadata.json")
  })

  it("says so when npm doesn't record the repository or commit", async () => {
    await expect(readIconTags({ files: "*.json" }, { name: "a", version: "1.0.0" }, [], fake({}))).rejects.toThrow(
      /which repository and commit a@1.0.0 came from/
    )
  })
})

describe("iconWords", () => {
  it("matches keys without the Icon its exports add, or the Ltr of a mirrored copy, and reads number tags", () => {
    const words = iconWords(
      [{ "arrow-down": ["south", 911], "arrow-down-01": ["down"], "text-indent": ["tab"] }],
      [
        { label: "IconArrowDown", names: ["IconArrowDown", "IconArrowDownFilled"] },
        { label: "ArrowDown01Icon", names: ["ArrowDown01Icon"] },
        { label: "TextIndentLtr", names: ["TextIndentLtrRegular"] }
      ]
    )
    expect(words).toEqual({ IconArrowDown: ["south", "911"], ArrowDown01Icon: ["down"], TextIndentLtr: ["tab"] })
  })

  it("takes a record's lists and the fields that group icons, but not its names, codes or versions", () => {
    const table = Object.fromEntries(
      numbered(100).map((_, index) => [
        `icon-${index}`,
        {
          name: `icon-${index}`,
          category: `Group ${index % 5}`,
          tags: [`word${index}`],
          unicode: `e${index}`,
          version: "1.0"
        }
      ])
    )
    const words = iconWords([table], numbered(100))
    expect(words.Icon7).toEqual(["word7", "group 2"])
  })

  it("finds the table that names the set's icons, wherever it is", () => {
    const icons = numbered(30)
    const data = {
      meta: { version: "1.0", styles: { a: ["x"], b: ["y"] } },
      list: { icons: icons.map((_, index) => ({ id: `icon-${index}`, keywords: [`word${index}`] })) }
    }
    expect(iconWords([data], icons).Icon12).toEqual(["word12"])
    expect(iconWords([{ unrelated: ["x"] }], icons)).toEqual({})
  })

  it("leaves out words most of a set's icons have", () => {
    const icons = numbered(20)
    const table = Object.fromEntries(icons.map((_, index) => [`icon-${index}`, ["icon", `word${index}`]]))
    expect(iconWords([table], icons).Icon4).toEqual(["word4"])
  })
})

describe("manifestText", () => {
  it("writes each icon's tags on one line, and the rest as indented JSON", () => {
    const manifest = {
      version: 3,
      name: "Lucide",
      icons: { render: "export", tags: { X: ["close", "cancel"], Cog: [] } }
    }
    const text = manifestText(manifest)
    expect(text).toContain('      "X": ["close","cancel"],\n      "Cog": []\n    }')
    expect(JSON.parse(text)).toEqual(manifest)
    expect(manifestText({ version: 3, name: "Nova" })).toBe(
      `${JSON.stringify({ version: 3, name: "Nova" }, null, 2)}\n`
    )
  })
})

describe("closestVersion", () => {
  it("takes the same version, or else the newest release before it", () => {
    expect(closestVersion(["2.1.0", "2.1.10", "2.2.0"], "2.1.10")).toBe("2.1.10")
    expect(closestVersion(["2.0.0", "2.1.9", "2.1.11", "2.2.0-beta.1"], "2.1.10")).toBe("2.1.9")
    expect(closestVersion(["3.0.0"], "2.1.10")).toBeUndefined()
  })
})
