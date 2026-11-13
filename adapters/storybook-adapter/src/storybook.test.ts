import type { ContainerSpec, DesignNode, EntitiesSource } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { readStoryFile, storyName } from "./csf.ts"
import { exportStoryScreen, importStoryScreens, titleFolders } from "./screens.ts"
import { writeStoryArgs } from "./write.ts"

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

  it("lists each story in a folder for each part of its title, as Storybook's sidebar does", async () => {
    const { screens = [] } = await importStoryScreens(source)

    expect(screens.map(({ folders }) => folders)).toEqual([
      ["UI", "Button"],
      ["UI", "Button"],
      ["UI", "Button"],
      ["Card"],
      ["Card"]
    ])
    expect(titleFolders(" App / Plan card /")).toEqual(["App", "Plan card"])
  })

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
      // A frame hugging the story, as Storybook draws one at its own size.
      kind: "frame",
      root: {
        type: "layout",
        style: { width: { size: "hug" } },
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

describe("writeStoryArgs", () => {
  it("gives a story the args that differ from its meta's, keeping code in its args as it's written", () => {
    const written = writeStoryArgs(button, "Outline", {
      children: "Save changes",
      disabled: true,
      variant: "ghost"
    })

    expect(written).toContain(
      'export const Outline: Story = { args: { variant: "ghost", onClick: () => {}, disabled: true } }'
    )
    expect(readStoryFile(written).stories[1]?.args).toEqual({
      children: "Save changes",
      disabled: true,
      variant: "ghost"
    })
  })

  it("adds args to a story without any, and leaves one with the meta's args alone", () => {
    expect(writeStoryArgs(button, "Default", { children: "Delete", disabled: false })).toContain(
      'export const Default: Story = { args: { children: "Delete" } }'
    )
    expect(writeStoryArgs(button, "Default", { children: "Save changes", disabled: false })).toBe(button)
  })

  it("leaves a story that's a function as it is", () => {
    expect(writeStoryArgs(card, "Plain", { title: "Hi" })).toBe(card)
  })
})

describe("exportStoryScreen", () => {
  it("writes the props of what a story's screen draws back to its file as the story's args", async () => {
    const files = new Map([["src/stories/button.stories.tsx", button]])

    const source: EntitiesSource = {
      files: async () => [...files.keys()],
      read: async (path) => files.get(path),
      componentFor: async (_file, _specifier, name) => `ui/button/${name}`
    }

    const [screen] = (await importStoryScreens(source)).screens ?? []

    if (!screen) {
      throw new Error("no screen")
    }

    const drawn: DesignNode = {
      type: "component",
      id: "story",
      component: "ui/button/Button",
      props: { children: "Publish", disabled: false }
    }

    const edited: ContainerSpec = { ...screen.screen, root: { type: "layout", id: "root", children: [drawn] } }
    const writes = await exportStoryScreen(screen, edited, source)

    expect(writes.map((write) => write.path)).toEqual(["src/stories/button.stories.tsx"])
    expect(readStoryFile(writes[0]?.text ?? "").stories[0]?.args).toEqual({ children: "Publish", disabled: false })
  })
})
