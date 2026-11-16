import { AppWindow, Component, Database, type LucideIcon, Route, SquareLibrary, Webhook } from "lucide-react"
import type { LensId } from "./model.ts"

const shots = import.meta.glob<string>("../canvas-container/shots/*.png", { eager: true, import: "default" })

const shot = (name: string) => shots[`../canvas-container/shots/${name}.png`]

export interface LensInfo {
  id: LensId
  label: string
  icon: LucideIcon
  /** Where the lens is read from, for the menu that opens one. */
  source: string
}

export const lenses: Record<LensId, LensInfo> = {
  pages: { id: "pages", label: "Pages", icon: Route, source: "TanStack Router" },
  components: { id: "components", label: "Components", icon: Component, source: "The app's code" },
  stories: { id: "stories", label: "Stories", icon: SquareLibrary, source: "Storybook" },
  data: { id: "data", label: "Data", icon: Database, source: "Drizzle" }
}

/** A lens the project doesn't have a source for, shown in the menu as unavailable. */
export const missingLens = { label: "API", icon: Webhook, source: "No OpenAPI document found" }

/** Something a lens draws: a frame on its canvas and a row in its panel. */
export interface Item {
  id: string
  name: string
  /** A row's indent in the panel. */
  level?: number
  /** Its picture, for a frame. */
  picture?: string | undefined
  /** What the inspector says it is. */
  facts: [string, string][]
  /** Items in other lenses it's linked to. */
  links?: { lens: LensId; id: string }[]
  /** Where it's drawn on the canvas, in canvas pixels. */
  at: { x: number; y: number; width: number }
}

const page = (
  id: string,
  name: string,
  path: string,
  picture: string,
  at: Item["at"],
  level: number,
  links: Item["links"] = []
): Item => ({
  id,
  name,
  level,
  picture: shot(picture),
  facts: [
    ["Path", path],
    ["File", `src/routes${path === "/" ? "/index" : path}.tsx`]
  ],
  links,
  at
})

export const items: Record<LensId, Item[]> = {
  pages: [
    page("app", "App", "/", "app-light", { x: 360, y: 0, width: 360 }, 0, [{ lens: "components", id: "button" }]),
    page("detail", "Project detail", "/projects/$projectId", "detail-light", { x: 0, y: 380, width: 360 }, 1, [
      { lens: "stories", id: "button-default" }
    ]),
    page("billing", "Billing", "/settings/billing", "billing-light", { x: 400, y: 380, width: 360 }, 1, [
      { lens: "components", id: "plan" },
      { lens: "data", id: "plans" }
    ]),
    page("profile", "Profile", "/settings/profile", "profile-light", { x: 800, y: 380, width: 360 }, 1, [
      { lens: "data", id: "users" }
    ]),
    page("login", "Sign in", "/login", "login-light", { x: 1200, y: 0, width: 360 }, 0)
  ],
  components: [
    {
      id: "button",
      name: "Button",
      picture: shot("button-default-light"),
      facts: [
        ["File", "src/components/ui/button.tsx"],
        ["Variants", "default, outline"]
      ],
      links: [{ lens: "stories", id: "button-default" }],
      at: { x: 0, y: 0, width: 200 }
    },
    {
      id: "plan",
      name: "PlanCard",
      picture: shot("plan-default-light"),
      facts: [
        ["File", "src/components/plan-card.tsx"],
        ["Props", "name, price, popular"]
      ],
      links: [
        { lens: "stories", id: "plan-popular" },
        { lens: "pages", id: "billing" }
      ],
      at: { x: 260, y: 0, width: 300 }
    }
  ],
  stories: [
    {
      id: "button-default",
      name: "Default",
      level: 1,
      picture: shot("button-default-light"),
      facts: [
        ["Story", "Button / Default"],
        ["File", "src/components/ui/button.stories.tsx"]
      ],
      links: [{ lens: "components", id: "button" }],
      at: { x: 0, y: 0, width: 200 }
    },
    {
      id: "button-outline",
      name: "Outline",
      level: 1,
      picture: shot("button-outline-light"),
      facts: [
        ["Story", "Button / Outline"],
        ["File", "src/components/ui/button.stories.tsx"]
      ],
      links: [{ lens: "components", id: "button" }],
      at: { x: 240, y: 0, width: 200 }
    },
    {
      id: "plan-popular",
      name: "Popular",
      level: 1,
      picture: shot("plan-popular-light"),
      facts: [
        ["Story", "PlanCard / Popular"],
        ["File", "src/components/plan-card.stories.tsx"]
      ],
      links: [{ lens: "components", id: "plan" }],
      at: { x: 0, y: 180, width: 300 }
    },
    {
      id: "plan-side",
      name: "Side by side",
      level: 1,
      picture: shot("plan-side-light"),
      facts: [
        ["Story", "PlanCard / Side by side"],
        ["File", "src/components/plan-card.stories.tsx"]
      ],
      links: [{ lens: "components", id: "plan" }],
      at: { x: 340, y: 180, width: 420 }
    }
  ],
  data: [
    {
      id: "users",
      name: "users",
      facts: [
        ["Columns", "id, email, name, plan_id"],
        ["File", "src/db/schema.ts"]
      ],
      links: [{ lens: "pages", id: "profile" }],
      at: { x: 0, y: 0, width: 220 }
    },
    {
      id: "plans",
      name: "plans",
      facts: [
        ["Columns", "id, name, price"],
        ["File", "src/db/schema.ts"]
      ],
      links: [{ lens: "pages", id: "billing" }],
      at: { x: 320, y: 0, width: 220 }
    },
    {
      id: "projects",
      name: "projects",
      facts: [
        ["Columns", "id, owner_id, name, status"],
        ["File", "src/db/schema.ts"]
      ],
      at: { x: 0, y: 220, width: 220 }
    }
  ]
}

/** Each table's columns, for the ERD, with the table a column refers to. */
export const columns = {
  users: [
    { name: "id", type: "text" },
    { name: "email", type: "text" },
    { name: "name", type: "text" },
    { name: "plan_id", type: "text", refers: "plans" }
  ],
  plans: [
    { name: "id", type: "text" },
    { name: "name", type: "text" },
    { name: "price", type: "integer" }
  ],
  projects: [
    { name: "id", type: "text" },
    { name: "owner_id", type: "text", refers: "users" },
    { name: "name", type: "text" },
    { name: "status", type: "text" }
  ]
} satisfies Record<string, { name: string; type: string; refers?: string }[]>

/** The groups the Stories panel lists its stories under. */
export const storyFiles = {
  Button: ["button-default", "button-outline"],
  PlanCard: ["plan-popular", "plan-side"]
} satisfies Record<string, string[]>

export const appIcon = AppWindow
