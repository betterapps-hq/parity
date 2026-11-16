import { type ContainerSpec, type EntitiesSource, findNode, mapNodes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { readStoryFile, storyName } from "./csf.ts"
import {
  exportStoryScreen,
  importStories,
  importStoryScreens,
  storyBoundsId,
  storyLayerId,
  titleFolders
} from "./screens.ts"
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
  it("lists every story a file exports, CSF 2's bound templates too, though it draws only those it can read", () => {
    const bound = `import { Button } from "../button"
export default { component: Button }
const Template = (args) => <Button {...args} />
export const Primary = Template.bind({})
export const Plain = {}`

    expect(readStoryFile(bound)).toMatchObject({
      exportNames: ["Primary", "Plain"],
      stories: [{ exportName: "Plain" }]
    })
  })

  it("reads a meta and stories that spread a constant object into themselves, a later property winning", () => {
    const composed = `import { Button } from "../button"
const base = { component: Button, title: "UI/Base", args: { size: "sm" } }
export default { ...base, title: "UI/Button" }
const Primary = { args: { variant: "primary" } }
export const Large = { ...Primary, name: "Large one" }`

    expect(readStoryFile(composed)).toMatchObject({
      title: "UI/Button",
      component: { specifier: "../button", name: "Button" },
      stories: [{ exportName: "Large", name: "Large one", args: { size: "sm", variant: "primary" } }]
    })
  })

  it("reads the meta's title, component and args, and each story's own args over them", () => {
    expect(readStoryFile(button)).toEqual({
      title: "UI/Button",
      component: { specifier: "@/components/ui/button", name: "Button" },
      exportNames: ["Default", "Outline", "BigAndBold"],
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

  it("gives the story files by the project's component each meta names, with their stories (PAR-1128)", async () => {
    const { stories } = await importStories(source)

    expect(stories).toEqual({
      "ui/button/Button": [
        { path: "src/stories/button.stories.tsx", title: "UI/Button", exports: ["Default", "Outline", "BigAndBold"] }
      ]
    })
  })

  it("lists each story file in a folder for each part of its title, as Storybook's sidebar does", async () => {
    const { screens = [] } = await importStoryScreens(source)

    expect(screens.map(({ folders }) => folders)).toEqual([["UI", "Button"], ["Card"]])
    expect(titleFolders(" App / Plan card /")).toEqual(["App", "Plan card"])
  })

  it("imports each story file as a story design, named for its title's last part, a state for each story", async () => {
    const { screens = [] } = await importStoryScreens(source)

    expect(screens.map(({ ref, group, screen }) => [ref, group, screen.kind, screen.name])).toEqual([
      ["src/stories/button.stories.tsx", "UI/Button", "story", "Button"],
      ["src/stories/card.stories.tsx", "Card", "story", "Card"]
    ])
    // Every story shows, a row each.
    expect(screens[0]?.screen.view).toEqual({ allStates: true })
    expect(screens[0]?.screen.states?.map(({ id, name }) => [id, name])).toEqual([
      ["Default", "Default"],
      ["Outline", "Outline"],
      ["BigAndBold", "Big and bold"]
    ])
  })

  it("draws each story inside bounds of its own, its args as props, and shows it alone in its state", async () => {
    const { screens = [] } = await importStoryScreens(source)
    const button = screens[0]?.screen

    expect(button?.root).toMatchObject({
      type: "layout",
      // Hugging the story in each mode's window, as Storybook draws one at its own size.
      style: { width: { size: "hug" } }
    })
    expect(button && findNode(button.root, storyBoundsId("Outline"))).toMatchObject({
      type: "layout",
      name: "Outline",
      children: [
        {
          type: "component",
          id: storyLayerId("Outline"),
          component: "ui/button/Button",
          props: { children: "Save changes", disabled: false, variant: "outline" }
        }
      ]
    })
    expect(button?.states?.[1]?.overrides).toEqual({
      [storyBoundsId("Default")]: { hidden: true },
      [storyBoundsId("BigAndBold")]: { hidden: true }
    })
  })

  it("draws a story that renders itself with its function, loaded from the story file as a component", async () => {
    const { screens = [], sources } = await importStoryScreens(source)
    const card = screens[1]?.screen

    expect(sources).toEqual({
      "story:src/stories/card.stories.tsx#Invite": { path: "src/stories/card.stories.tsx", export: "Invite.render" },
      "story:src/stories/card.stories.tsx#Plain": { path: "src/stories/card.stories.tsx", export: "Plain" }
    })
    expect(card && findNode(card.root, storyLayerId("Invite"))).toMatchObject({
      type: "component",
      component: "story:src/stories/card.stories.tsx#Invite",
      name: "Invite"
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
  const files = new Map([["src/stories/button.stories.tsx", button]])

  const source: EntitiesSource = {
    files: async () => [...files.keys()],
    read: async (path) => files.get(path),
    componentFor: async (_file, _specifier, name) => `ui/button/${name}`
  }

  const imported = async () => {
    const [screen] = (await importStoryScreens(source)).screens ?? []

    if (!screen) {
      throw new Error("no screen")
    }

    return screen
  }

  it("writes the props each story draws back to its file as the story's args", async () => {
    const screen = await imported()

    const edited: ContainerSpec = {
      ...screen.screen,
      root: mapNodes(screen.screen.root, (node) =>
        node.id === storyLayerId("Default") && node.type === "component"
          ? { ...node, props: { children: "Publish", disabled: false } }
          : node
      )
    }

    const writes = await exportStoryScreen(screen, edited, source)
    const stories = readStoryFile(writes[0]?.text ?? "").stories

    expect(writes.map((write) => write.path)).toEqual(["src/stories/button.stories.tsx"])
    expect(stories[0]?.args).toEqual({ children: "Publish", disabled: false })
    expect(stories[1]?.args).toEqual({ children: "Save changes", disabled: false, variant: "outline" })
  })

  it("writes what a story's state sets over its layer's props", async () => {
    const screen = await imported()

    const edited: ContainerSpec = {
      ...screen.screen,
      states: screen.screen.states?.map((state) =>
        state.id === "Outline"
          ? {
              ...state,
              overrides: { ...state.overrides, [storyLayerId("Outline")]: { props: { children: "Cancel" } } }
            }
          : state
      )
    }

    const writes = await exportStoryScreen(screen, edited, source)

    expect(readStoryFile(writes[0]?.text ?? "").stories[1]?.args).toEqual({
      children: "Cancel",
      disabled: false,
      variant: "outline"
    })
  })

  it("writes nothing while no story has changed", async () => {
    const screen = await imported()

    expect(await exportStoryScreen(screen, screen.screen, source)).toEqual([])
  })
})
