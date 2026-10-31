import type { ContainerSpec, StateSpec } from "./document.ts"
import { componentLibrary, type ComponentLibrary } from "./render.ts"

/**
 * Designs for testing what's drawn: each patch that changes a node, alone and together, so the canvas, the agent's
 * Get and the editor's rules can check they see the same nodes `resolveDesign` draws. Imported as
 * `@parity-app/core/fixtures`; it's test data, not part of core's API.
 */

/** A person's initials in a circle, bound to a param with a default. */
const avatar: ContainerSpec = {
  id: "avatar",
  name: "Avatar",
  kind: "component",
  position: { x: 0, y: 0 },
  params: { initials: { type: "text", default: "AB" } },
  root: {
    type: "layout",
    id: "circle",
    style: { padding: 2, radius: "radius-full" },
    responsive: { mobile: { style: { padding: 1 } } },
    children: [{ type: "text", id: "initials", text: "??", bind: { text: "initials" }, style: { weight: 500 } }]
  },
  states: [{ id: "base", name: "Base" }]
}

/**
 * A card with a bound title, a layout variant whose Inline option turns its body into a row, a Compact state that
 * changes a value that option sets, responsive patches, and an avatar inside it with args and overrides.
 */
const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 400, y: 0 },
  params: {
    title: { type: "text", default: "Card title" },
    layout: {
      type: "variant",
      options: [
        { id: "stacked", name: "Stacked" },
        { id: "inline", name: "Inline", overrides: { body: { style: { direction: "row", gap: 6 } } } }
      ]
    }
  },
  root: {
    type: "layout",
    id: "body",
    style: { direction: "column", gap: 4, padding: 4 },
    // Under the variant: an Inline card stays a row on mobile.
    responsive: { mobile: { style: { gap: 2, padding: 2 } } },
    children: [
      {
        type: "instance",
        id: "avatar",
        design: "avatar",
        args: { initials: "CD" },
        overrides: { circle: { style: { background: "primary" } } }
      },
      {
        type: "layout",
        id: "copy",
        children: [
          { type: "text", id: "title", text: "Title", bind: { text: "title" }, style: { weight: 600 } },
          { type: "text", id: "meta", text: "Updated today", responsive: { mobile: { hidden: true } } }
        ]
      }
    ]
  },
  states: [
    { id: "base", name: "Base" },
    { id: "compact", name: "Compact", overrides: { body: { style: { gap: 2 } }, meta: { text: "Today" } } }
  ]
}

/**
 * A screen placing the card with args and overrides that reach into its avatar, a responsive patch that picks the
 * card's variant on mobile, and a state that reaches inside the card.
 */
const profile: ContainerSpec = {
  id: "profile",
  name: "Profile",
  position: { x: 800, y: 0 },
  root: {
    type: "layout",
    id: "page",
    style: { padding: 8, gap: 4 },
    responsive: { mobile: { style: { padding: 4 } } },
    children: [
      { type: "text", id: "heading", tag: "h1", text: "Profile", responsive: { mobile: { text: "Me" } } },
      {
        type: "instance",
        id: "person",
        design: "card",
        args: { title: "Ada Lovelace", layout: "inline" },
        state: "compact",
        overrides: { meta: { text: "Joined 1843" }, "avatar/initials": { text: "AL", style: { weight: 700 } } },
        responsive: { mobile: { props: { layout: "stacked" } } }
      }
    ]
  },
  states: [
    { id: "base", name: "Base" },
    {
      id: "selected",
      name: "Selected",
      overrides: { "person/title": { text: "Selected" }, "person/avatar/circle": { style: { background: "accent" } } }
    }
  ]
}

/** One way to evaluate a design: its state and the variant options it shows. */
export interface EffectiveCase {
  name: string
  design: ContainerSpec
  state?: StateSpec
  variants?: Record<string, string>
}

export interface EffectiveFixture {
  designs: ContainerSpec[]
  library: ComponentLibrary
  /** The viewport option ids the designs' responsive patches are keyed by. */
  viewports: string[]
  cases: EffectiveCase[]
}

export const effectiveFixture: EffectiveFixture = {
  designs: [avatar, card, profile],
  library: componentLibrary([avatar, card, profile]),
  viewports: ["desktop", "mobile"],
  cases: [
    { name: "a bound text showing its param's default", design: card },
    { name: "a variant that turns the parent's layout into a row", design: card, variants: { layout: "inline" } },
    {
      name: "a state that overrides a value the variant sets",
      design: card,
      variants: { layout: "inline" },
      state: card.states[1]
    },
    { name: "responsive patches on the design and inside its instance", design: profile },
    { name: "a nested instance with args and overrides, in a state", design: profile, state: profile.states[1] }
  ]
}
