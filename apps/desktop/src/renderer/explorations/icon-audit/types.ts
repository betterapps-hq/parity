import type { icons } from "lucide-react"

/** Where an icon is used: the app, a design exploration, or a story. */
export type IconArea = "app" | "exploration" | "story"

/** One line that uses an icon. */
export interface IconSite {
  file: string
  /** 0 when the file imports the icon without naming it on a line of its own. */
  line: number
  code: string
  area: IconArea
}

/** A Fluent icon, its module, and the sizes it's drawn at. */
export interface FluentChoice {
  name: string
  /** The module under `@fluentui/react-icons/svg/`. */
  file: string
  /** Sizes with a drawing of their own, in pixels. */
  sizes: number[]
  /** Whether there's an unsized icon, which scales with the font size. */
  unsized: boolean
  /** Whether there's a colored version. */
  color: boolean
}

/** A Lucide icon the app uses, where, and the Fluent icons proposed in its place. */
export interface AuditedIcon {
  /** The name the app imports it under. */
  lucide: string
  /** Its name in Lucide's `icons` list, which an older import name may differ from. */
  lucideKey: keyof typeof icons
  /** What the icon stands for where it's used. */
  context: string
  areas: IconArea[]
  files: number
  sites: IconSite[]
  moreSites: number
  fluent: FluentChoice
  alternatives: FluentChoice[]
}
