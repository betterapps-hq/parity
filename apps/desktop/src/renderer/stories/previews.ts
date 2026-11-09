import type { ComponentPreview, PreviewImage } from "../../shared/protocol.ts"
import { answering } from "./host.ts"
import avatarGroup from "./previews/kit-avatar-group.webp?inline"
import avatar from "./previews/kit-avatar.webp?inline"
import badge from "./previews/kit-badge.webp?inline"
import buttonDestructive from "./previews/kit-button-destructive.webp?inline"
import buttonGhost from "./previews/kit-button-ghost.webp?inline"
import buttonLink from "./previews/kit-button-link.webp?inline"
import buttonOutline from "./previews/kit-button-outline.webp?inline"
import buttonSecondary from "./previews/kit-button-secondary.webp?inline"
import button from "./previews/kit-button.webp?inline"
import card from "./previews/kit-card.webp?inline"
import empty from "./previews/kit-empty.webp?inline"
import input from "./previews/kit-input.webp?inline"
import label from "./previews/kit-label.webp?inline"
import table from "./previews/kit-table.webp?inline"
import tabs from "./previews/kit-tabs.webp?inline"

/** A kept preview's pictures, sized as the store gives them; the thumbnail is the large picture, scaled. */
function picture(src: string, width: number, height: number): PreviewImage {
  return { thumb: src, large: src, width, height }
}

/**
 * Real previews of the example's UI kit in Parity's dark theme, as the offscreen renderer made them (PAR-207), by the
 * name each is kept under: a component's, or a variant's, as `Button?variant=outline`.
 */
export const kitPictures: Record<string, PreviewImage> = {
  Button: picture(button, 164, 96),
  "Button?variant=default": picture(button, 164, 96),
  "Button?variant=outline": picture(buttonOutline, 164, 96),
  "Button?variant=secondary": picture(buttonSecondary, 164, 96),
  "Button?variant=ghost": picture(buttonGhost, 164, 96),
  "Button?variant=destructive": picture(buttonDestructive, 164, 96),
  "Button?variant=link": picture(buttonLink, 164, 96),
  Card: picture(card, 93, 136),
  Avatar: picture(avatar, 96, 96),
  AvatarGroup: picture(avatarGroup, 215, 80),
  Tabs: picture(tabs, 101, 80),
  Input: picture(input, 518, 96),
  Table: picture(table, 101, 72),
  Empty: picture(empty, 223, 176),
  Label: picture(label, 105, 60)
}

/** What a stand-in preview is, beyond a made picture: its error, nothing to see, or a picture for older code. */
type Kept = { error: string } | { empty: true } | { last: PreviewImage }

/**
 * Previews of the example as the stories show them: the UI kit's real pictures, and every state a preview can be in,
 * as the example has them or, where it has none, given to a component that stands in. Badge's code changed, so its
 * last picture shows while it waits; the rest wait their turn, and the one being made never finishes.
 */
export const examplePreviews: Record<string, Kept> = {
  Badge: { last: picture(badge, 141, 80) },
  AvatarBadge: { empty: true },
  Separator: { empty: true },
  AvatarFallback: { error: "AvatarFallback: `AvatarFallback` must be used within `Avatar`" },
  AvatarImage: { error: "AvatarImage: `AvatarImage` must be used within `Avatar`" },
  CardAction: { error: "Cannot read properties of undefined (reading 'map')" },
  TableCaption: { error: "process is not defined" }
}

/** Long enough that making a preview never finishes while the story is open. */
const forever = 24 * 60 * 60 * 1000

/** Answers the service's preview requests with the example's previews until the story ends. */
export function answerPreviews(kept: Record<string, Kept> = examplePreviews): void {
  const answer = (component: string): ComponentPreview => {
    const key = `story:${component}`
    const image = kitPictures[component]

    if (image) {
      return { component, key, image }
    }

    return { component, key, ...kept[component] }
  }

  answering({
    "previews.lookup": ({ previews }) => ({ previews: previews.map(({ component }) => answer(component)) }),
    "previews.make": () => new Promise<ComponentPreview>((resolve) => setTimeout(resolve, forever))
  })
}
