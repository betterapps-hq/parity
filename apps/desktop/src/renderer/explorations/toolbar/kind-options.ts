import {
  ArrowUpRight,
  Component,
  Database,
  Film,
  Flag,
  Hash,
  Inbox,
  Languages,
  LoaderCircle,
  type LucideIcon,
  MousePointerClick,
  NotebookPen,
  Palette,
  Pointer,
  Quote,
  Route,
  Ruler,
  Shuffle,
  Sigma,
  Webhook
} from "lucide-react"
import { a11yKinds } from "../collaboration/a11y.tsx"
import type { AnnotationKind } from "./options.tsx"

/*
 * A copy of the options each kind of annotation places, from PAR-184's annotations exploration (its kinds.ts), which
 * isn't approved or on main yet. Each says what it's for and how Parity checks it against the render, the way
 * Accessibility annotations already do, so an annotation is a note agents can read and check rather than free text.
 * Accessibility's are the Accessibility annotations exploration's own.
 */

export interface KindOption {
  title: string
  /** What it's for. */
  hint: string
  /** How Parity checks it against the render. */
  check: string
  icon: LucideIcon
  bg: string
  ink: string
}

const tone = (hue: number) => ({ bg: `oklch(0.8 0.13 ${hue})`, ink: `oklch(0.27 0.08 ${hue})` })

/** Every kind ends with a note, for what its options don't cover. */
const note = (hint: string): KindOption => ({
  title: "Note",
  hint,
  check: "Read by people and agents, not checked",
  icon: NotebookPen,
  bg: "oklch(0.86 0 0)",
  ink: "oklch(0.25 0 0)"
})

/** What it does when someone uses it. */
const behaviour = {
  click: {
    title: "On click",
    hint: "What clicking or tapping it does",
    check: "Tried by an agent clicking it in a render, compared with the state or screen it should reach",
    icon: MousePointerClick,
    ...tone(250)
  },
  interaction: {
    title: "Hover and press",
    hint: "How it looks hovered, focused, pressed or disabled",
    check: "Compared with the design's hover, focus, pressed and disabled states, where it has them",
    icon: Pointer,
    ...tone(300)
  },
  state: {
    title: "Changes state",
    hint: "Which of the design's states it leads to, and when",
    check: "Compared with the design's states: the one it names must exist",
    icon: Shuffle,
    ...tone(185)
  },
  navigate: {
    title: "Navigates to",
    hint: "The screen or address it opens",
    check: "Compared with the link's href, and the design it names must exist",
    icon: ArrowUpRight,
    ...tone(220)
  },
  waiting: {
    title: "Loading and errors",
    hint: "What shows while it waits, and if it fails",
    check: "Compared with the design's loading and error states, where it has them",
    icon: LoaderCircle,
    ...tone(30)
  },
  motion: {
    title: "Motion",
    hint: "What moves, for how long, with which easing",
    check: "Compared with the transitions and animations in the render's styles",
    icon: Film,
    ...tone(350)
  },
  note: note("Anything else it does: timing, gestures, edge cases")
} satisfies Record<string, KindOption>

/** What it says, and where that comes from. */
const content = {
  source: {
    title: "Source",
    hint: "Where the words or data come from: a field, the CMS, the person using it",
    check: "Compared with the prop it fills; real data isn't checked",
    icon: Database,
    ...tone(150)
  },
  copy: {
    title: "Copy",
    hint: "The exact words, or the rule they follow",
    check: "Compared with the text the render draws",
    icon: Quote,
    ...tone(250)
  },
  format: {
    title: "Format",
    hint: "How a value is written: dates, prices, units, plurals",
    check: "Compared with the render's text, in each mode's locale",
    icon: Hash,
    ...tone(300)
  },
  limits: {
    title: "Limits",
    hint: "The shortest and longest it can be, and what happens past that",
    check: "Tried by an agent rendering it with the shortest and longest values",
    icon: Ruler,
    ...tone(88)
  },
  empty: {
    title: "Empty",
    hint: "What shows when there's nothing to show",
    check: "Compared with the design's empty state, where it has one",
    icon: Inbox,
    ...tone(185)
  },
  translation: {
    title: "Translation",
    hint: "Whether it's translated, and room for longer languages",
    check: "Tried by an agent rendering it with longer, translated text",
    icon: Languages,
    ...tone(350)
  },
  note: note("Anything else about what it says: tone, legal wording, who signs it off")
} satisfies Record<string, KindOption>

/** What whoever builds it should know. */
const development = {
  component: {
    title: "Component",
    hint: "The code component it's built with",
    check: "Compared with the component the layer is an instance of",
    icon: Component,
    ...tone(250)
  },
  token: {
    title: "Token",
    hint: "A token it must use instead of a raw value",
    check: "Compared with the render's computed styles and the token's value in each mode",
    icon: Palette,
    ...tone(300)
  },
  data: {
    title: "Data",
    hint: "The API or query that feeds it, and the shape it returns",
    check: "Compared with the props the design gives it; the API isn't called",
    icon: Webhook,
    ...tone(150)
  },
  route: {
    title: "Route",
    hint: "The address it lives at, and its parameters",
    check: "Read by people and agents, not checked",
    icon: Route,
    ...tone(185)
  },
  analytics: {
    title: "Analytics",
    hint: "The event it sends, when, and its properties",
    check: "Read by people and agents, not checked",
    icon: Sigma,
    ...tone(30)
  },
  flag: {
    title: "Feature flag",
    hint: "A flag or permission that shows or hides it",
    check: "Read by people and agents, not checked",
    icon: Flag,
    ...tone(88)
  },
  note: note("Anything else for whoever builds it: performance, edge cases, known gaps")
} satisfies Record<string, KindOption>

/** Each kind's options, in the order its bar places them. */
export const kindOptions: Record<AnnotationKind, Record<string, KindOption>> = {
  behaviour,
  content,
  accessibility: a11yKinds,
  development
}
