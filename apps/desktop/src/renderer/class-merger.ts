import { setCn } from "@buildkitgg/shadcn-baseui-kit"
import { createCn } from "cn/config"

/** The wrapped-text roles in styles.css, each a size and a line height in one class (docs/typography.md). */
const typeRoles = ["body", "description", "message", "empty", "code"]

/**
 * The class merger the kit's components and the app share, which knows the app's type: `text-2xs` is a size, not a
 * color, so `text-2xs text-muted-foreground` keeps both, and a `type-*` role replaces a size and a line height as
 * `text-xs` would, so a caller's `type-description` on a kit description drops the kit's `text-sm`.
 */
export const cn = createCn({
  extend: {
    theme: { text: ["2xs"] },
    classGroups: { "type-role": [{ type: typeRoles }] },
    conflictingClassGroups: { "type-role": ["font-size", "leading", "text-wrap"], "font-size": ["type-role"] }
  }
})

/** Hands the kit's components the app's merger. Called once, before anything renders. */
export function installClassMerger(): void {
  setCn(cn)
}
