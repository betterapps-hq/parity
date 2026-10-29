import { describe, expect, it } from "vitest"
import { closestVersion, manifestText, readIconTags, type TagFetchers } from "./icon-tags.ts"

/** Fetchers that answer from data, recording what was asked. */
function fake(answers: Partial<TagFetchers>, asked: string[] = []): TagFetchers {
  return {
    packageFile: async (name, version, file) => {
      asked.push(`${name}@${version}/${file}`)
      return (await answers.packageFile?.(name, version, file)) ?? ""
    },
    publishedVersions: answers.publishedVersions ?? (async () => []),
    publishedCommit: answers.publishedCommit ?? (async () => undefined),
    repositoryFiles: async (repo, commit, matches) => {
      asked.push(`${repo}@${commit} ${matches.source}`)
      return (await answers.repositoryFiles?.(repo, commit, matches)) ?? []
    },
    pageScripts: async (url) => {
      asked.push(url)
      return (await answers.pageScripts?.(url)) ?? { served: "2026-10-29", scripts: [] }
    }
  }
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
      { package: "lucide-static", file: "tags.json", read: (text) => JSON.parse(text) as Record<string, string[]> },
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

  it("matches keys without the Icon its exports add, or the Ltr of a mirrored copy, and reads number tags", async () => {
    const found = await readIconTags(
      {
        file: "icons.json",
        read: () => ({ "arrow-down": ["south", 911], "arrow-down-01": ["down"], "text-indent": ["tab"] })
      },
      { name: "@tabler/icons-react", version: "3.50.0" },
      [
        { label: "IconArrowDown", names: ["IconArrowDown", "IconArrowDownFilled"] },
        { label: "ArrowDown01Icon", names: ["ArrowDown01Icon"] },
        { label: "TextIndentLtr", names: ["TextIndentLtrRegular"] }
      ],
      fake({})
    )
    expect(found.tags).toEqual({
      IconArrowDown: ["south", "911"],
      ArrowDown01Icon: ["down"],
      TextIndentLtr: ["tab"]
    })
  })

  it("reads a repository's files at the commit npm says the version came from", async () => {
    const asked: string[] = []
    const found = await readIconTags(
      {
        repository: "https://github.com/microsoft/fluentui-system-icons",
        files: "assets/*/metadata.json",
        readFiles: (files) =>
          Object.fromEntries(
            files.map(({ text }) => {
              const { name, metaphor } = JSON.parse(text) as { name: string; metaphor: string[] }
              return [name, metaphor]
            })
          )
      },
      { name: "@fluentui/react-icons", version: "2.0.344" },
      [{ label: "Settings", names: ["SettingsRegular", "Settings24Regular"] }],
      fake(
        {
          publishedCommit: async () => "f1260014e8a4fcfa6777182fd6cf082fc5e952d8",
          repositoryFiles: async () => [
            { path: "assets/Settings/metadata.json", text: '{"name":"Settings","metaphor":["gear","cog"]}' }
          ]
        },
        asked
      )
    )
    expect(asked).toEqual([
      "https://github.com/microsoft/fluentui-system-icons@f1260014e8a4fcfa6777182fd6cf082fc5e952d8 ^assets\\/[^/]+\\/metadata\\.json$"
    ])
    expect(found.tags).toEqual({ Settings: ["gear", "cog"] })
    expect(found.source).toBe("github.com/microsoft/fluentui-system-icons@f1260014e8a4/assets/*/metadata.json")
  })

  it("says so when npm doesn't record the commit", async () => {
    await expect(
      readIconTags(
        { repository: "https://github.com/a/b", files: "*.json", readFiles: () => ({}) },
        { name: "a", version: "1.0.0" },
        [],
        fake({})
      )
    ).rejects.toThrow(/which commit a@1.0.0 came from/)
  })

  it("reads a website's scripts for a set that publishes no tags, saying the day they were served", async () => {
    const asked: string[] = []
    const found = await readIconTags(
      {
        page: "https://heroicons.com",
        readScripts: (scripts) => JSON.parse(scripts.find((script) => script.path.endsWith("page.js"))!.text)
      },
      { name: "@heroicons/react", version: "2.2.0" },
      [
        { label: "Cog6Tooth", names: ["Cog6ToothIcon"] },
        { label: "XMark", names: ["XMarkIcon"] }
      ],
      fake(
        {
          pageScripts: async () => ({
            served: "2026-10-29",
            scripts: [
              { path: "/_next/static/chunks/main.js", text: "" },
              { path: "/_next/static/chunks/page.js", text: JSON.stringify({ "cog-6-tooth": ["gear", "settings"] }) }
            ]
          })
        },
        asked
      )
    )
    expect(asked).toEqual(["https://heroicons.com"])
    expect(found.tags).toEqual({ Cog6Tooth: ["gear", "settings"] })
    expect(found.source).toBe("heroicons.com as served on 2026-10-29")
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
