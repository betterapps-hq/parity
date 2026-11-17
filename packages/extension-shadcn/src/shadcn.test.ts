import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { detectLibraries, scriptSettings, shadcnCatalog, shadcnRemoval, shadcnSetup } from "./shadcn.ts"

const sync = "shadcn-sync sync --base radix --icons phosphor --style lyra --theme stone --css tailwind"

/** A package.json's text. */
function pkg(fields: Record<string, Record<string, string>>): string {
  return JSON.stringify({ name: "app", ...fields })
}

/** sync's `manifest.json`, as it writes it beside the components. */
function manifest(settings: Record<string, string>): string {
  return JSON.stringify({ generatorVersion: "0.1.4", settings })
}

describe("the shadcn/ui extension", () => {
  it("has a manifest Parity accepts, found in every React project, with its libraries provider and the files it reads", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    expect(found.manifest.contributes.providers).toEqual({ libraries: {} })
    expect(found.versions?.packages).toEqual(["react"])
    expect(found.manifest.permissions?.read).toContain("node_modules/@buildkitgg/shadcn/manifest.json")
  })
})

describe("detectLibraries", () => {
  it("reads the components sync generated with their kit's file, in their own package, with their icons", () => {
    const found = detectLibraries({
      packageJson: pkg({ dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn" } }),
      syncManifest: manifest({ base: "base", icons: "phosphor", style: "nova", theme: "neutral", css: "tailwind" })
    })

    expect(found).toEqual([
      {
        registry: "@buildkitgg/shadcn-baseui-nova",
        package: "@buildkitgg/shadcn",
        name: "Shadcn Nova",
        description: "Every shadcn component on Base UI, in the nova style.",
        tailwindEntry: "tailwind.css",
        icons: "@phosphor-icons/react"
      }
    ])
  })

  it("names the kit of sync's base, with no Tailwind entry when each component brings its own CSS", () => {
    const [found] = detectLibraries({
      packageJson: pkg({ dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn" } }),
      syncManifest: manifest({ base: "aria", icons: "lucide", style: "lyra", theme: "neutral", css: "compiled" })
    })

    expect(found).toMatchObject({
      registry: "@buildkitgg/shadcn-aria-lyra",
      description: "Every shadcn component on React Aria, in the lyra style."
    })
    expect(found?.tailwindEntry).toBeUndefined()
  })

  it("reads components shadcn's CLI copied for their style's tokens only, and an old style as nova", () => {
    expect(
      detectLibraries({
        packageJson: pkg({}),
        componentsJson: JSON.stringify({ style: "radix-mira", iconLibrary: "tabler" })
      })
    ).toEqual([
      {
        registry: "@buildkitgg/shadcn-baseui-mira",
        name: "Shadcn Mira",
        description: "shadcn/ui components copied into the app, in the mira style.",
        icons: "@tabler/icons-react"
      }
    ])
    expect(detectLibraries({ componentsJson: JSON.stringify({ style: "new-york" }) })[0]?.registry).toBe(
      "@buildkitgg/shadcn-baseui-nova"
    )
  })

  it("finds nothing without sync's package or a components.json, or with files that don't parse", () => {
    expect(detectLibraries({ packageJson: pkg({ dependencies: { react: "^19.0.0" } }) })).toEqual([])
    // Generated, but no longer a dependency.
    expect(detectLibraries({ packageJson: pkg({}), syncManifest: manifest({ base: "base" }) })).toEqual([])
    expect(detectLibraries({ packageJson: "{", componentsJson: "not json" })).toEqual([])
  })
})

describe("shadcnCatalog", () => {
  it("offers Shadcn with defaults and the icon set the project has, before it's set up", () => {
    const [shadcn] = shadcnCatalog({ packageJson: pkg({ dependencies: { "@tabler/icons-react": "^3.0.0" } }) })

    expect(shadcn).toMatchObject({ id: "shadcn", package: "@buildkitgg/shadcn", installed: false })
    expect(Object.fromEntries(shadcn!.settings.map(({ id, value }) => [id, value]))).toEqual({
      base: "base",
      style: "nova",
      theme: "neutral",
      icons: "tabler"
    })
    expect(shadcn!.settings.map(({ id, label }) => `${id} ${label}`)).toEqual([
      "style Theme",
      "theme Color",
      "base Base",
      "icons Icons"
    ])
    expect(shadcn!.links?.website).toBe("https://ui.shadcn.com")
    expect(shadcn!.settings.find(({ id }) => id === "base")?.options.map(({ label }) => label)).toEqual([
      "Base UI",
      "Radix",
      "React Aria"
    ])
  })

  it("starts at what sync generated once it's set up, or what its script says before it first runs", () => {
    const project = pkg({ devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" }, scripts: { postinstall: sync } })

    const values = (files: Parameters<typeof shadcnCatalog>[0]) =>
      Object.fromEntries(shadcnCatalog(files)[0]!.settings.map(({ id, value }) => [id, value]))

    expect(shadcnCatalog({ packageJson: project })[0]?.installed).toBe(true)
    expect(values({ packageJson: project })).toEqual({
      base: "radix",
      style: "lyra",
      theme: "stone",
      icons: "phosphor"
    })
    expect(
      values({
        packageJson: project,
        syncManifest: manifest({ base: "aria", icons: "lucide", style: "vega", theme: "zinc", css: "compiled" })
      })
    ).toEqual({ base: "aria", style: "vega", theme: "zinc", icons: "lucide" })
  })
})

describe("scriptSettings", () => {
  it("reads sync's flags from the part of a script that runs it", () => {
    expect(scriptSettings(`husky && ${sync}`)).toEqual({
      base: "radix",
      icons: "phosphor",
      style: "lyra",
      theme: "stone",
      css: "tailwind"
    })
    expect(scriptSettings("husky")).toEqual({})
    expect(scriptSettings("shadcn-sync sync --style plaid")).toEqual({})
  })
})

describe("shadcnSetup", () => {
  const chosen = { base: "radix", style: "lyra", theme: "stone", icons: "phosphor" }

  it("adds sync, the icons and the base's primitives, and a postinstall after the project's own, in Tailwind mode with Tailwind", () => {
    const plan = shadcnSetup(
      { packageJson: pkg({ devDependencies: { tailwindcss: "^4.0.0" }, scripts: { postinstall: "husky" } }) },
      chosen
    )

    expect(plan).toEqual({
      devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" },
      packages: ["@phosphor-icons/react", "radix-ui"],
      scripts: { postinstall: `husky && ${sync}` },
      styles: "@buildkitgg/shadcn/tailwind.css"
    })
  })

  it("changes the settings of a project set up already, keeping its sync and what it has, and its CSS mode", () => {
    const plan = shadcnSetup(
      {
        packageJson: pkg({
          dependencies: { "@hugeicons/react": "^1.0.0", "@hugeicons/core-free-icons": "^4.0.0" },
          devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.5" },
          scripts: { postinstall: `${sync} && patch-package` }
        }),
        syncManifest: manifest({ base: "radix", icons: "phosphor", style: "lyra", theme: "stone", css: "compiled" })
      },
      { base: "base", style: "nova", theme: "neutral", icons: "hugeicons" }
    )

    expect(plan).toEqual({
      scripts: {
        postinstall:
          "shadcn-sync sync --base base --icons hugeicons --style nova --theme neutral --css compiled && patch-package"
      }
    })
  })

  it("replaces sync's command in a postinstall that joins its commands with ; and ||", () => {
    const plan = shadcnSetup(
      {
        packageJson: pkg({
          devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.5" },
          scripts: { postinstall: `husky; ${sync} || true` }
        })
      },
      { base: "base", style: "nova", theme: "neutral", icons: "lucide" }
    )

    expect(plan.scripts?.postinstall).toBe(
      "husky; shadcn-sync sync --base base --icons lucide --style nova --theme neutral --css tailwind || true"
    )
  })

  it("gives sync Fluent icons through Buildkit's adapter, adding the adapter and Fluent's icons", () => {
    const plan = shadcnSetup({ packageJson: pkg({}) }, { ...chosen, base: "base", icons: "fluent" })

    expect(plan.packages).toEqual(["@fluentui/react-icons", "@buildkitgg/shadcn-icons-fluent"])
    expect(plan.scripts?.postinstall).toContain("--icons @buildkitgg/shadcn-icons-fluent")
  })

  it("reads Fluent icons back from what sync generated, as the adapter's package", () => {
    const files = {
      packageJson: pkg({ dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn" } }),
      syncManifest: manifest({
        base: "base",
        icons: "@buildkitgg/shadcn-icons-fluent",
        style: "nova",
        theme: "neutral",
        css: "tailwind"
      })
    }

    expect(detectLibraries(files)[0]?.icons).toBe("@fluentui/react-icons")
    expect(shadcnCatalog(files)[0]?.settings.find((setting) => setting.id === "icons")?.value).toBe("fluent")
  })

  it("refuses settings sync doesn't take", () => {
    expect(() => shadcnSetup({}, { ...chosen, style: "plaid" })).toThrow(/settings aren't ones shadcn-sync takes/)
  })
})

describe("shadcnRemoval", () => {
  it("uninstalls sync and its components, keeps the project's own postinstall, and drops the stylesheet import", () => {
    const plan = shadcnRemoval({
      packageJson: pkg({
        dependencies: { "@buildkitgg/shadcn": "link:node_modules/.buildkit/shadcn", "@phosphor-icons/react": "^2.1.0" },
        devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" },
        scripts: { postinstall: `husky && ${sync}` }
      })
    })

    expect(plan).toEqual({
      packages: ["@buildkitgg/shadcn-sync", "@buildkitgg/shadcn"],
      scripts: { postinstall: "husky" },
      styles: "@buildkitgg/shadcn/tailwind.css"
    })
  })

  it("removes a postinstall that only ran sync", () => {
    const plan = shadcnRemoval({
      packageJson: pkg({ devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" }, scripts: { postinstall: sync } })
    })

    expect(plan.scripts).toEqual({ postinstall: null })
  })

  it("takes sync out of a postinstall that joins its commands with ; and ||", () => {
    const removal = (postinstall: string) =>
      shadcnRemoval({
        packageJson: pkg({ devDependencies: { "@buildkitgg/shadcn-sync": "^0.1.4" }, scripts: { postinstall } })
      }).scripts

    expect(removal(`husky; ${sync}`)).toEqual({ postinstall: "husky" })
    expect(removal(`${sync} || true; patch-package`)).toEqual({ postinstall: "true; patch-package" })
  })
})
