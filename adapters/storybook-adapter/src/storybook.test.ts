import type { EntitiesSource } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { readStoryFile, storyName } from "./csf.ts"
import { importStoryScreens } from "./screens.ts"

const button = `
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Button } from "@/components/ui/button"

const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Save changes", disabled: false }
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Outline: Story = { args: { variant: "outline", onClick: () => {} } }
export const BigAndBold: Story = { name: "Big and bold", args: { size: "lg" } }
`

const card = `
import { Card } from "../components/ui/card"

export default { component: Card }

export const Invite = { render: () => <Card>Invite</Card> }
export const Plain = () => <Card />
`

describe("readStoryFile", () => {
  it("reads the meta's title, component and args, and each story's own args over them", () => {
    expect(readStoryFile(button)).toEqual({
      title: "UI/Button",
      component: { specifier: "@/components/ui/button", name: "Button" },
      stories: [
        {
          exportName: "Default",
          name: "Default",
          args: { children: "Save changes", disabled: false }
        },
        {
          exportName: "Outline",
          name: "Outline",
          args: { children: "Save changes", disabled: false, variant: "outline" }
        },
        {
          exportName: "BigAndBold",
          name: "Big and bold",
          args: { children: "Save changes", disabled: false, size: "lg" }
        }
      ]
    })
  })

  it("finds the function a story draws with: its own render, itself as a function, or the meta's render", () => {
    expect(readStoryFile(card).stories.map((story) => [story.exportName, story.render])).toEqual([
      ["Invite", "Invite.render"],
      ["Plain", "Plain"]
    ])
    expect(
      readStoryFile(
        "export default { render: (args) => <b {...args} /> }; export const Bold = { args: { title: 'Hi' } }"
      ).stories.map((story) => story.render)
    ).toEqual(["default.render"])
  })

  it("reads no stories from a file without a default export", () => {
    expect(readStoryFile("export const Button = 1").stories).toEqual([])
  })
})

describe("storyName", () => {
  it("puts an export's name in words, as Storybook does", () => {
    expect(storyName("PrimaryLarge")).toBe("Primary Large")
    expect(storyName("URLField")).toBe("URL Field")
  })
})

describe("importStoryScreens", () => {
  const files = new Map([
    ["src/stories/button.stories.tsx", button],
    ["src/stories/card.stories.tsx", card]
  ])

  const source: EntitiesSource = {
    files: async (match) => [...files.keys()].filter((path) => match.test(path)),
    read: async (path) => files.get(path),
    componentFor: async (_file, specifier, name) => (specifier.endsWith("button") ? `ui/button/${name}` : undefined)
  }

  it("imports each story as a screen of its component with its args, grouped by title", async () => {
    const { screens = [] } = await importStoryScreens(source)

    expect(screens.map(({ ref, group, screen }) => [ref, group, screen.name])).toEqual([
      ["src/stories/button.stories.tsx#Default", "UI/Button", "Default"],
      ["src/stories/button.stories.tsx#Outline", "UI/Button", "Outline"],
      ["src/stories/button.stories.tsx#BigAndBold", "UI/Button", "Big and bold"],
      ["src/stories/card.stories.tsx#Invite", "Card", "Invite"],
      ["src/stories/card.stories.tsx#Plain", "Card", "Plain"]
    ])
    expect(screens[1]?.screen).toMatchObject({
      kind: "screen",
      root: {
        type: "layout",
        children: [
          {
            type: "component",
            component: "ui/button/Button",
            props: { children: "Save changes", disabled: false, variant: "outline" }
          }
        ]
      }
    })
  })

  it("draws a story that renders itself with its function, loaded from the story file as a component", async () => {
    const { screens = [], sources } = await importStoryScreens(source)

    expect(sources).toEqual({
      "story:src/stories/card.stories.tsx#Invite": { path: "src/stories/card.stories.tsx", export: "Invite.render" },
      "story:src/stories/card.stories.tsx#Plain": { path: "src/stories/card.stories.tsx", export: "Plain" }
    })
    expect(screens[3]?.screen.root).toMatchObject({
      children: [{ type: "component", component: "story:src/stories/card.stories.tsx#Invite", name: "Invite" }]
    })
  })
})
