import { inOrder, type Lens } from "@parity-app/lenses"
import {
  AppWindow,
  Bookmark,
  Component,
  Database,
  Grid2x2,
  LayoutTemplate,
  type LucideIcon,
  Route,
  Server,
  Table2
} from "lucide-react"
import { kindColors } from "../../canvas/kinds.tsx"
import type { LensId } from "./model.ts"

const shots = import.meta.glob<string>("../canvas-container/shots/*.png", { eager: true, import: "default" })
const previews = import.meta.glob<string>("../../stories/previews/kit-*.webp", { eager: true, import: "default" })

/** One of the example app's pages, at a size and theme, as the canvas-container exploration shot them. */
const shot = (name: string) => shots[`../canvas-container/shots/${name}.png`]!

/** One of the kit's components, as the stories' previews drew it. */
const preview = (name: string) => previews[`../../stories/previews/kit-${name}.webp`]!

/** A lens as `@parity-app/lenses` has it, with what the exploration draws it with. */
export interface LensInfo extends Lens<LensId> {
  Icon: LucideIcon
  /** The keys that show it, as the tabs' Ctrl+1 to Ctrl+9 did. */
  shortcut: string
  /** The left panel's first tab, which lists what the lens draws, and what it says with nothing to list. */
  outline: { label: string; search: string; none?: string }
  /** The inspector's first tab. */
  inspector: string
  /** What the inspector says with nothing selected. */
  nothing: string
  /** It holds designs, so the left panel has what goes into them: Components, Icons, Media and Tokens. */
  assets?: boolean
  /** It's drawn and edited with the canvas's tools. */
  tools?: boolean
}

export const lenses: Record<LensId, LensInfo> = {
  pages: {
    id: "pages",
    name: "Pages",
    Icon: Route,
    icon: "route",
    order: 1,
    shortcut: "Ctrl+1",
    outline: { label: "Layers", search: "Search pages" },
    inspector: "Design",
    nothing: "Select a page on the canvas or in Layers.",
    tools: true
  },
  screens: {
    id: "screens",
    name: "Screens",
    Icon: AppWindow,
    icon: "app-window",
    order: 2,
    shortcut: "Ctrl+2",
    outline: { label: "Layers", search: "Search layers" },
    inspector: "Design",
    nothing: "Select a screen or frame on the canvas or in Layers.",
    assets: true,
    tools: true
  },
  components: {
    id: "components",
    name: "Components",
    Icon: Component,
    icon: "component",
    order: 3,
    shortcut: "Ctrl+3",
    outline: { label: "Layers", search: "Search components" },
    inspector: "Design",
    nothing: "Select a component on the canvas or in Layers.",
    tools: true
  },
  stories: {
    id: "stories",
    name: "Stories",
    Icon: Bookmark,
    icon: "bookmark",
    order: 4,
    shortcut: "Ctrl+4",
    outline: { label: "Layers", search: "Search stories" },
    inspector: "Design",
    nothing: "Select a story on the canvas or in Layers."
  },
  data: {
    id: "data",
    name: "Data",
    Icon: Database,
    icon: "database",
    order: 5,
    shortcut: "Ctrl+5",
    outline: { label: "Tables", search: "Search tables" },
    inspector: "Schema",
    nothing: "Select a table on the canvas or in Tables."
  },
  api: {
    id: "api",
    name: "API",
    Icon: Server,
    icon: "server",
    order: 6,
    shortcut: "Ctrl+6",
    outline: { label: "Endpoints", search: "Search endpoints", none: "No endpoints yet." },
    inspector: "Endpoint",
    nothing: "",
    unavailable: {
      title: "No OpenAPI document",
      description: "Add an openapi.yaml or openapi.json to the project, or choose the one the app serves.",
      action: "Choose a document…"
    }
  }
}

/** The lenses in order, as the View menu lists them. */
export const lensList = inOrder(Object.values(lenses))

export const lensOrder = lensList.map((lens) => lens.id)

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A frame inside a thing: a page or story's one, a screen's modes, a component's states. */
export interface Frame {
  name: string
  src: string
  box: Box
}

export interface Column {
  name: string
  type: string
  key?: "primary" | "foreign"
  /** The table a foreign key refers to. */
  refers?: string
}

export type ThingKind = "page" | "layout" | "screen" | "component" | "story" | "story-file" | "table"

/** Something a lens draws: a row in its left panel, a shape on its canvas, and what the inspector says of it. */
export interface Thing {
  id: string
  kind: ThingKind
  name: string
  /** Under its name: a page or layout's path, a story file's file. */
  detail?: string
  /** The group it's in: a page's layout, a story's file. */
  parent?: string
  /** Its frames on the canvas. A group has none: its box is round its members. */
  frames?: Frame[]
  /** A table's columns. */
  columns?: Column[]
  /** Its layers, listed under it in the left panel. */
  layers?: Layer[]
  /** What the inspector says of it, read from the project's code. */
  facts?: [string, string][]
  /** What it's linked to in the other lenses. */
  links?: Ref[]
}

export interface Layer {
  name: string
  kind: "frame" | "text" | "instance"
}

export interface Ref {
  lens: LensId
  id: string
}

export interface KindLook {
  icon: LucideIcon
  color: string
  /** The word the inspector's heading says it is. */
  word: string
}

/** The color a table is drawn in: the media teal, since nothing else on a canvas is a table. */
const tableColor = "var(--canvas-media)"

export const kindLooks: Record<ThingKind, KindLook> = {
  page: { icon: Route, color: kindColors.screen, word: "Page" },
  layout: { icon: LayoutTemplate, color: kindColors.screen, word: "Layout" },
  screen: { icon: AppWindow, color: kindColors.screen, word: "Screen" },
  component: { icon: Component, color: kindColors.component, word: "Component" },
  story: { icon: Bookmark, color: "var(--canvas-story)", word: "Story" },
  "story-file": { icon: Grid2x2, color: "var(--canvas-story)", word: "Stories" },
  table: { icon: Table2, color: tableColor, word: "Table" }
}

const desktop = { w: 1280, h: 800 }
const mobile = { w: 390, h: 844 }

/** One of the app's pages, at its URL, at the desktop size, as its router draws it. */
const page = (
  id: string,
  name: string,
  path: string,
  at: { x: number; y: number },
  { loads = false, ...extra }: Partial<Thing> & { loads?: boolean } = {}
): Thing => ({
  id,
  kind: "page",
  name,
  detail: path,
  frames: [{ name, src: shot(`${id === "home" ? "app" : id}-light`), box: { ...at, ...desktop } }],
  facts: [
    ["Path", path],
    ["File", `src/routes${path === "/" ? "/index" : path}.tsx`],
    ["Loads data", loads ? "Yes" : "No"]
  ],
  ...extra
})

/** A screen designed in every mode the project has: light, dark and phone. */
const screen = (id: string, name: string, picture: string, at: { x: number; y: number }, links: Ref[]): Thing => ({
  id,
  kind: "screen",
  name,
  frames: [
    { name: "Light", src: shot(`${picture}-light`), box: { x: at.x, y: at.y, ...desktop } },
    { name: "Dark", src: shot(`${picture}-dark`), box: { x: at.x + 1344, y: at.y, ...desktop } },
    { name: "Phone", src: shot(`${picture}-mobile-light`), box: { x: at.x + 2688, y: at.y, ...mobile } }
  ],
  layers: [
    { name: "Header", kind: "instance" },
    { name: "Main", kind: "frame" },
    { name: "Title", kind: "text" }
  ],
  facts: [
    ["File", "designs/app.par"],
    ["Modes", "Light, Dark, Phone"]
  ],
  links
})

/** A component's board: its states side by side, each its preview's size. */
function component(
  id: string,
  name: string,
  file: string,
  states: [string, string, number, number][],
  at: { x: number; y: number },
  links: Ref[]
): Thing {
  let x = at.x

  const frames = states.map(([state, src, w, h]) => {
    const frame = { name: state, src, box: { x, y: at.y, w, h } }
    x += w + 40

    return frame
  })

  return {
    id,
    kind: "component",
    name,
    frames,
    facts: [
      ["File", file],
      ["States", states.map(([state]) => state).join(", ")]
    ],
    links
  }
}

export const things: Record<LensId, Thing[]> = {
  pages: [
    {
      id: "app-layout",
      kind: "layout",
      name: "App",
      detail: "/",
      facts: [
        ["Path", "/"],
        ["File", "src/routes/__root.tsx"]
      ]
    },
    page(
      "home",
      "Home",
      "/",
      { x: 0, y: 0 },
      {
        parent: "app-layout",
        layers: [
          { name: "PageHeader", kind: "instance" },
          { name: "Projects", kind: "frame" },
          { name: "Button", kind: "instance" }
        ],
        links: [
          { lens: "components", id: "button" },
          { lens: "components", id: "card" },
          { lens: "data", id: "projects" }
        ]
      }
    ),
    page(
      "detail",
      "Project",
      "/projects/$projectId",
      { x: 1440, y: 0 },
      {
        parent: "app-layout",
        loads: true,
        links: [
          { lens: "components", id: "badge" },
          { lens: "components", id: "tabs" },
          { lens: "data", id: "projects" },
          { lens: "screens", id: "project-screen" }
        ]
      }
    ),
    {
      id: "settings-layout",
      kind: "layout",
      name: "Settings",
      detail: "/settings",
      facts: [
        ["Path", "/settings"],
        ["File", "src/routes/settings/route.tsx"],
        ["Redirects to", "/settings/profile"]
      ]
    },
    page(
      "billing",
      "Billing",
      "/settings/billing",
      { x: 0, y: 1360 },
      {
        parent: "settings-layout",
        loads: true,
        layers: [
          { name: "SettingsNav", kind: "instance" },
          { name: "Plans", kind: "frame" },
          { name: "PlanCard", kind: "instance" },
          { name: "PlanCard", kind: "instance" }
        ],
        links: [
          { lens: "components", id: "plan" },
          { lens: "components", id: "button" },
          { lens: "data", id: "plans" },
          { lens: "data", id: "subscriptions" },
          { lens: "screens", id: "billing-screen" }
        ]
      }
    ),
    page(
      "profile",
      "Profile",
      "/settings/profile",
      { x: 1440, y: 1360 },
      {
        parent: "settings-layout",
        loads: true,
        links: [
          { lens: "components", id: "avatar" },
          { lens: "components", id: "input" },
          { lens: "data", id: "users" },
          { lens: "screens", id: "profile-screen" }
        ]
      }
    ),
    page(
      "login",
      "Sign in",
      "/login",
      { x: 3120, y: 0 },
      {
        links: [
          { lens: "components", id: "input" },
          { lens: "components", id: "button" },
          { lens: "data", id: "users" },
          { lens: "screens", id: "sign-in-screen" }
        ]
      }
    )
  ],
  screens: [
    screen("billing-screen", "Billing", "billing", { x: 0, y: 0 }, [
      { lens: "pages", id: "billing" },
      { lens: "components", id: "plan" },
      { lens: "components", id: "button" }
    ]),
    screen("profile-screen", "Profile", "profile", { x: 0, y: 1240 }, [
      { lens: "pages", id: "profile" },
      { lens: "components", id: "avatar" },
      { lens: "components", id: "input" }
    ]),
    screen("project-screen", "Project", "detail", { x: 3600, y: 0 }, [
      { lens: "pages", id: "detail" },
      { lens: "components", id: "badge" },
      { lens: "components", id: "tabs" }
    ]),
    screen("sign-in-screen", "Sign in", "login", { x: 3600, y: 1240 }, [
      { lens: "pages", id: "login" },
      { lens: "components", id: "input" },
      { lens: "components", id: "button" }
    ])
  ],
  components: [
    component(
      "button",
      "Button",
      "src/components/ui/button.tsx",
      [
        ["Default", preview("button"), 164, 96],
        ["Secondary", preview("button-secondary"), 164, 96],
        ["Outline", preview("button-outline"), 164, 96],
        ["Ghost", preview("button-ghost"), 164, 96],
        ["Destructive", preview("button-destructive"), 164, 96],
        ["Link", preview("button-link"), 164, 96]
      ],
      { x: 0, y: 0 },
      [
        { lens: "stories", id: "button-default" },
        { lens: "stories", id: "button-outline" },
        { lens: "pages", id: "home" },
        { lens: "pages", id: "billing" },
        { lens: "pages", id: "login" }
      ]
    ),
    component(
      "plan",
      "PlanCard",
      "src/components/plan-card.tsx",
      [
        ["Default", shot("plan-default-light"), 273, 498],
        ["Popular", shot("plan-popular-light"), 273, 498]
      ],
      { x: 1280, y: 0 },
      [
        { lens: "stories", id: "plan-default" },
        { lens: "stories", id: "plan-popular" },
        { lens: "stories", id: "plan-side" },
        { lens: "pages", id: "billing" },
        { lens: "screens", id: "billing-screen" }
      ]
    ),
    component(
      "badge",
      "Badge",
      "src/components/ui/badge.tsx",
      [["Default", preview("badge"), 141, 80]],
      { x: 0, y: 280 },
      [{ lens: "pages", id: "detail" }]
    ),
    component(
      "avatar",
      "Avatar",
      "src/components/ui/avatar.tsx",
      [
        ["Default", preview("avatar"), 96, 96],
        ["Group", preview("avatar-group"), 215, 80]
      ],
      { x: 300, y: 280 },
      [{ lens: "pages", id: "profile" }]
    ),
    component(
      "tabs",
      "Tabs",
      "src/components/ui/tabs.tsx",
      [["Default", preview("tabs"), 101, 80]],
      { x: 820, y: 280 },
      [{ lens: "pages", id: "detail" }]
    ),
    component(
      "input",
      "Input",
      "src/components/ui/input.tsx",
      [["Default", preview("input"), 518, 96]],
      { x: 0, y: 560 },
      [
        { lens: "pages", id: "login" },
        { lens: "pages", id: "profile" }
      ]
    ),
    component(
      "card",
      "Card",
      "src/components/ui/card.tsx",
      [["Default", preview("card"), 93, 136]],
      { x: 700, y: 560 },
      [{ lens: "pages", id: "home" }]
    ),
    component(
      "empty",
      "Empty",
      "src/components/ui/empty.tsx",
      [["Default", preview("empty"), 223, 176]],
      { x: 960, y: 560 },
      []
    )
  ],
  stories: [
    {
      id: "button-stories",
      kind: "story-file",
      name: "Button",
      detail: "button.stories.tsx",
      facts: [
        ["File", "src/components/ui/button.stories.tsx"],
        ["Stories", "2"]
      ],
      links: [{ lens: "components", id: "button" }]
    },
    {
      id: "button-default",
      kind: "story",
      name: "Default",
      parent: "button-stories",
      frames: [{ name: "Default", src: shot("button-default-light"), box: { x: 0, y: 0, w: 219, h: 98 } }],
      facts: [
        ["Story", "Button / Default"],
        ["Args", "children: Button"]
      ],
      links: [{ lens: "components", id: "button" }]
    },
    {
      id: "button-outline",
      kind: "story",
      name: "Outline",
      parent: "button-stories",
      frames: [{ name: "Outline", src: shot("button-outline-light"), box: { x: 279, y: 0, w: 219, h: 98 } }],
      facts: [
        ["Story", "Button / Outline"],
        ["Args", "variant: outline"]
      ],
      links: [{ lens: "components", id: "button" }]
    },
    {
      id: "plan-stories",
      kind: "story-file",
      name: "PlanCard",
      detail: "plan-card.stories.tsx",
      facts: [
        ["File", "src/components/plan-card.stories.tsx"],
        ["Stories", "3"]
      ],
      links: [{ lens: "components", id: "plan" }]
    },
    {
      id: "plan-default",
      kind: "story",
      name: "Default",
      parent: "plan-stories",
      frames: [{ name: "Default", src: shot("plan-default-light"), box: { x: 0, y: 400, w: 273, h: 498 } }],
      facts: [
        ["Story", "PlanCard / Default"],
        ["Args", "name: Team, price: 12"]
      ],
      links: [{ lens: "components", id: "plan" }]
    },
    {
      id: "plan-popular",
      kind: "story",
      name: "Popular",
      parent: "plan-stories",
      frames: [{ name: "Popular", src: shot("plan-popular-light"), box: { x: 333, y: 400, w: 273, h: 498 } }],
      facts: [
        ["Story", "PlanCard / Popular"],
        ["Args", "name: Pro, price: 24, popular: true"]
      ],
      links: [
        { lens: "components", id: "plan" },
        { lens: "pages", id: "billing" }
      ]
    },
    {
      id: "plan-side",
      kind: "story",
      name: "Side by side",
      parent: "plan-stories",
      frames: [{ name: "Side by side", src: shot("plan-side-light"), box: { x: 666, y: 400, w: 572, h: 498 } }],
      facts: [
        ["Story", "PlanCard / Side by side"],
        ["Args", "plans: 2"]
      ],
      links: [{ lens: "components", id: "plan" }]
    }
  ],
  data: [
    {
      id: "users",
      kind: "table",
      name: "users",
      frames: [{ name: "users", src: "", box: { x: 0, y: 160, w: 260, h: 0 } }],
      columns: [
        { name: "id", type: "uuid", key: "primary" },
        { name: "email", type: "text" },
        { name: "name", type: "text" },
        { name: "created_at", type: "timestamp" }
      ],
      facts: [["File", "src/db/schema.ts"]],
      links: [
        { lens: "pages", id: "profile" },
        { lens: "pages", id: "login" }
      ]
    },
    {
      id: "subscriptions",
      kind: "table",
      name: "subscriptions",
      frames: [{ name: "subscriptions", src: "", box: { x: 380, y: 0, w: 260, h: 0 } }],
      columns: [
        { name: "id", type: "uuid", key: "primary" },
        { name: "user_id", type: "uuid", key: "foreign", refers: "users" },
        { name: "plan_id", type: "text", key: "foreign", refers: "plans" },
        { name: "status", type: "text" },
        { name: "renews_at", type: "timestamp" }
      ],
      facts: [["File", "src/db/schema.ts"]],
      links: [{ lens: "pages", id: "billing" }]
    },
    {
      id: "plans",
      kind: "table",
      name: "plans",
      frames: [{ name: "plans", src: "", box: { x: 760, y: 60, w: 260, h: 0 } }],
      columns: [
        { name: "id", type: "text", key: "primary" },
        { name: "name", type: "text" },
        { name: "price", type: "integer" },
        { name: "interval", type: "text" }
      ],
      facts: [["File", "src/db/schema.ts"]],
      links: [
        { lens: "pages", id: "billing" },
        { lens: "components", id: "plan" }
      ]
    },
    {
      id: "projects",
      kind: "table",
      name: "projects",
      frames: [{ name: "projects", src: "", box: { x: 380, y: 300, w: 260, h: 0 } }],
      columns: [
        { name: "id", type: "uuid", key: "primary" },
        { name: "owner_id", type: "uuid", key: "foreign", refers: "users" },
        { name: "name", type: "text" },
        { name: "status", type: "text" }
      ],
      facts: [["File", "src/db/schema.ts"]],
      links: [
        { lens: "pages", id: "home" },
        { lens: "pages", id: "detail" }
      ]
    }
  ],
  api: []
}

/** A page's links to other pages, as the canvas draws them: from the page that links to where it goes. */
export const pageLinks: [string, string][] = [
  ["home", "detail"],
  ["home", "billing"],
  ["billing", "profile"]
]

/** A table card's header and row heights on the canvas. */
export const tableHeader = 40
export const tableRow = 30

/** A thing by lens and id. */
export function thing(lens: LensId, id: string | undefined): Thing | undefined {
  return id === undefined ? undefined : things[lens].find((each) => each.id === id)
}

/** What's in a group, among some things. */
export function membersIn(list: readonly Thing[], id: string): Thing[] {
  return list.filter((each) => each.parent === id)
}

/** What's in a group of a lens. */
export function members(lens: LensId, id: string): Thing[] {
  return membersIn(things[lens], id)
}

/** Every box a thing draws among some things, its members' for a group, with a table's height from its rows. */
export function boxesIn(list: readonly Thing[], item: Thing): Box[] {
  if (item.kind === "table") {
    const box = item.frames![0]!.box

    return [{ ...box, h: tableHeader + item.columns!.length * tableRow }]
  }

  if (item.frames) {
    return item.frames.map((frame) => frame.box)
  }

  return membersIn(list, item.id).flatMap((member) => boxesIn(list, member))
}

/** The box round some boxes. */
export function bounds(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))

  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y
  }
}

/** The project the window has open, and the ones it opened before. */
export const project = { name: "shadcn-vite", folder: "D:\\code\\shadcn-vite" }

export const recentProjects = [
  { name: "copacker", folder: "D:\\code\\copacker" },
  { name: "blank-slate", folder: "D:\\code\\blank-slate" },
  { name: "marketing-site", folder: "D:\\code\\marketing-site" }
]
