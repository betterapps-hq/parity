import type { ViewItem, ViewOptions } from "@parity-app/extension-api"
import { componentsWithStories, type ProjectStorybook } from "./storybook.ts"

/*
 * What the Storybook extension draws in its views (PAR-1094), as data: the Stories tab's tree of components and their
 * stories, the Design tab's Stories section for the selected component, and the setup guide's steps.
 */

/** A view's options and items, as the extension fills it. */
export interface Filled {
  options: ViewOptions
  items: ViewItem[]
}

const open = { command: "storybook.open" }

/** A story's export name in words, as Storybook shows it: `PrimaryLarge` as `Primary Large`. */
export function storyName(exportName: string): string {
  return exportName
    .replaceAll("_", " ")
    .replaceAll(/([a-z\d])([A-Z])/g, "$1 $2")
    .replaceAll(/([A-Za-z])(\d)/g, "$1 $2")
    .replaceAll(/\s+/g, " ")
    .trim()
}

/** A file's name without its folders. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

/** How many of something there are, in words: `1 story`, `3 stories`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The stories of one component, as items under `parent`: each story its file exports, named as Storybook names it, or
 * the file itself when detection found no exports. With more than one file, each story says which it's in.
 */
function storiesOf(storybook: ProjectStorybook, component: string, parent?: string): ViewItem[] {
  const files = storybook.stories[component] ?? []
  const target = { type: "component" as const, key: component }

  return files.flatMap((file) => {
    const exports = file.exports ?? []
    const base: Omit<ViewItem, "key" | "label"> = { target }

    if (parent !== undefined) {
      base.parent = parent
    }

    if (exports.length === 0) {
      return [{ ...base, key: file.path, label: fileName(file.path), detail: file.path, icon: "file-code" }]
    }

    return exports.map((exported) => {
      const item: ViewItem = { ...base, key: `${file.path}#${exported}`, label: storyName(exported), icon: "bookmark" }

      if (files.length > 1) {
        item.detail = fileName(file.path)
      }

      return item
    })
  })
}

/** The number of stories a component has: its files' exports, or its files where detection found none. */
function storyCount(storybook: ProjectStorybook, component: string): number {
  return (storybook.stories[component] ?? []).reduce((sum, file) => sum + Math.max(1, file.exports?.length ?? 0), 0)
}

/** The components with stories, by name. */
function byName(storybook: ProjectStorybook): string[] {
  return componentsWithStories(storybook).toSorted((a, b) => a.localeCompare(b))
}

/** The Stories tab: every component with stories, by name, each opening to its stories. */
export function storiesTree(storybook: ProjectStorybook): Filled {
  const components = byName(storybook)

  return {
    options: { empty: { title: "No stories found" }, itemActions: [open] },
    items: components.flatMap((component) => [
      {
        key: component,
        label: component,
        detail: count(storyCount(storybook, component), "story", "stories"),
        icon: "component",
        target: { type: "component", key: component }
      },
      ...storiesOf(storybook, component, component)
    ])
  }
}

/**
 * The Design tab's Stories section: every component's stories, each about its component, so the section shows the
 * selected component's.
 */
export function componentStories(storybook: ProjectStorybook): Filled {
  return {
    options: { itemActions: [open] },
    items: byName(storybook).flatMap((component) => storiesOf(storybook, component))
  }
}

/** Where the project's Storybook runs, once it's been found or started. */
export interface RunningAt {
  address: string
}

/**
 * The setup guide: whether Parity found Storybook's config and stories, and whether Storybook is running, each a step
 * that's done or says what's missing.
 */
export function setupGuide(storybook: ProjectStorybook, running?: RunningAt): Filled {
  const withStories = componentsWithStories(storybook)
  const stories = withStories.reduce((sum, component) => sum + storyCount(storybook, component), 0)

  const done = { icon: "circle-check", tone: "success" } as const
  const todo = { icon: "circle-alert", tone: "warning" } as const

  const items: ViewItem[] = [
    { key: "config", label: "Config found", detail: `Storybook's config is in ${storybook.configDir}.`, ...done },
    withStories.length > 0
      ? {
          key: "stories",
          label: "Stories found",
          detail: `${count(stories, "story", "stories")} for ${count(withStories.length, "component", "components")}.`,
          ...done
        }
      : {
          key: "stories",
          label: "No stories yet",
          detail: "Add a .stories file beside a component, and its stories show in Parity.",
          ...todo
        },
    running
      ? { key: "running", label: "Storybook is running", detail: running.address, ...done }
      : {
          key: "running",
          label: "Storybook isn't running yet",
          detail: "Open in Storybook starts it, which can take a minute.",
          icon: "circle-dashed",
          tone: "info"
        }
  ]

  return {
    options: {
      description: "Parity reads your stories from Storybook's config and opens them in Storybook.",
      toolbar: [open]
    },
    items
  }
}
