import { componentIds, type ParsedComponent } from "@parity-app/code"
import type { ComponentSource } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { componentFor } from "./storybook.ts"

/*
 * Which of the project's components a story's meta names. Adapters' actions (Open in Storybook) and the stories on the
 * canvas find a component by the key this returns, so it must pick the one component the story imports even when
 * other components share its name: in another folder of the app, in a library, or in two libraries.
 */

const app = (path: string, name: string, uiKit = false): ParsedComponent => ({ name, path, export: name, uiKit })

/** Two libraries that both export a Button, keyed `library/Export` as `findLibraries` keys them. */
const libraries = {
  "nova/Button": { path: "@kit/nova", export: "Button", library: "nova" },
  "lyra/Button": { path: "@kit/lyra", export: "Button", library: "lyra" },
  "nova/Card": { path: "@kit/nova", export: "Card", library: "nova" }
} satisfies Record<string, ComponentSource>

/** The app's own components, keyed by the real `componentIds`, around the libraries' keys. */
const components = {
  ...libraries,
  ...componentIds(
    [
      app("src/components/ui/button.tsx", "Button", true),
      app("src/components/ui/card.tsx", "Card", true),
      app("src/marketing/card.tsx", "Card"),
      app("src/billing/card.tsx", "Card"),
      app("src/billing/forms/field.tsx", "Field"),
      app("src/settings/forms/field.tsx", "Field"),
      { name: "Hero", path: "src/marketing/hero.tsx", export: "default", uiKit: false }
    ],
    new Set(Object.keys(libraries))
  )
} satisfies Record<string, ComponentSource>

/** `@/` points at `src`, as the example's Vite config has it. */
const resolveAlias = async (specifier: string) => (specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : undefined)

const find = (story: string, specifier: string, name: string) =>
  componentFor(story, { specifier, name }, components, resolveAlias)

describe("componentFor", () => {
  it("gives every component sharing a name its own key, so one key never stands for two", () => {
    expect(Object.keys(components)).toEqual(
      expect.arrayContaining([
        "nova/Button",
        "lyra/Button",
        "Button",
        "Card",
        "marketing/Card",
        "billing/Card",
        "billing/forms/Field",
        "settings/forms/Field"
      ])
    )
    expect(new Set(Object.values(components).map((source) => `${source.path}#${source.export}`)).size).toBe(
      Object.keys(components).length
    )
  })

  it("tells apart the app's components of one name by the file the story imports", async () => {
    expect(await find("src/stories/card.stories.tsx", "@/components/ui/card", "Card")).toBe("Card")
    expect(await find("src/stories/card.stories.tsx", "@/marketing/card", "Card")).toBe("marketing/Card")
    expect(await find("src/billing/card.stories.tsx", "./card", "Card")).toBe("billing/Card")
    expect(await find("src/settings/forms/field.stories.tsx", "./field.tsx", "Field")).toBe("settings/forms/Field")
  })

  it("tells a library's component from the app's own of the same name, and two libraries' apart", async () => {
    expect(await find("src/stories/button.stories.tsx", "@kit/nova", "Button")).toBe("nova/Button")
    expect(await find("src/stories/button.stories.tsx", "@kit/lyra", "Button")).toBe("lyra/Button")
    expect(await find("src/stories/button.stories.tsx", "@/components/ui/button", "Button")).toBe("Button")
  })

  it("finds a default export by the file, whatever the story calls it", async () => {
    expect(await find("src/stories/hero.stories.tsx", "@/marketing/hero", "default")).toBe("Hero")
  })

  it("finds nothing rather than a namesake when the story imports a component Parity doesn't list", async () => {
    expect(await find("src/stories/card.stories.tsx", "@/support/card", "Card")).toBeUndefined()
    expect(await find("src/stories/card.stories.tsx", "@kit/other", "Card")).toBeUndefined()
    expect(await find("src/stories/card.stories.tsx", "@/marketing/card", "Banner")).toBeUndefined()
  })
})
