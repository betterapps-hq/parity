import type { Decorator } from "@storybook/react-vite"
import type { ReactElement, ReactNode } from "react"

/*
 * What design stories on a piece of canvas share: its themes and background, the decorator that lets a story scroll,
 * and the dashboard's data. The pieces themselves each have a file of their own beside this one: `Themes`,
 * `CanvasPane`, `CanvasBoard`, the designs to put on boards (`DashboardDesign`, `StatCard`, `Sticker`,
 * `PricingDesign`), and a clock with play, pause and a scrubber for stories that move (`useClock`, `Playback`).
 */

export type Theme = "light" | "dark"

/**
 * Gives a story its own scrolling, since the app's page never scrolls (see `#root` in styles.css) and a story taller
 * than the window would otherwise be cut off at its bottom.
 */
export const scrolls: Decorator = (Story) => <div className="h-screen overflow-y-auto bg-background">{Story()}</div>

/** The canvas's own background in each theme, as tldraw draws it. */
export const canvasBackground: Record<Theme, string> = { light: "#f8fafb", dark: "#101012" }

/**
 * Wraps one of a design's elements, by its id, so a story can mark it: outline it, hide it, put a copy in its place.
 * Without one, the design draws as it is.
 */
export type Marker = (id: string, element: ReactElement) => ReactNode

/** The dashboard's stat cards, by id. */
export const stats = {
  revenue: { label: "Revenue", value: "$48.2k" },
  users: { label: "Active users", value: "2,310" },
  churn: { label: "Churn", value: "1.2%" }
}

export type Stat = keyof typeof stats

/** Where the sticker sits on the chart, from the chart's top-left. */
export const stickerHome = { x: 232, y: 8 }
