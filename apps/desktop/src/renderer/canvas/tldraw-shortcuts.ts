import type { TLUiOverrides } from "tldraw"

/**
 * tldraw's own shortcuts, turned off. Its drawing tools (E, D, R, A and the rest), flips, rotations, printing, dark mode
 * and grid act on shapes and settings Parity doesn't use, and would switch tools behind Parity's toolbar. The canvas's
 * shortcuts are Parity's own, in chrome/keymap.ts; tldraw keeps what isn't a shortcut: Space to pan, arrows to nudge.
 */
export const withoutTldrawShortcuts: TLUiOverrides = {
  actions: (_editor, actions) =>
    Object.fromEntries(Object.entries(actions).map(([id, action]) => [id, { ...action, kbd: undefined }])),
  tools: (_editor, tools) =>
    Object.fromEntries(Object.entries(tools).map(([id, tool]) => [id, { ...tool, kbd: undefined }]))
}
