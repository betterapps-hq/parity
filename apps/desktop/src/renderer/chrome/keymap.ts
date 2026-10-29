import { matches } from "./keys.ts"

/**
 * Every keyboard shortcut, in one place. The menus and tooltips show these keys, the Keyboard shortcuts dialog lists
 * them, and the key handlers match events against them, so what's shown is what works.
 *
 * Keys are written as on Windows, a space between each: `Ctrl Shift Z`. Ctrl is Cmd on a Mac, where `formatKeys` shows
 * them with the Mac's symbols. The first keys are the ones shown; the rest do the same, as Figma's do.
 */
export interface Binding {
  label: string
  keys: readonly string[]
  group: Group
}

export type Group = "Tools" | "Selection" | "Edit" | "View" | "Object" | "Arrange" | "File" | "Help"

export const groups: readonly Group[] = ["Tools", "Selection", "Edit", "Object", "Arrange", "View", "File", "Help"]

export const keymap = {
  select: { group: "Tools", label: "Move and select", keys: ["V"] },
  hand: { group: "Tools", label: "Hand", keys: ["H"] },
  text: { group: "Tools", label: "Text", keys: ["T"] },
  interact: { group: "Tools", label: "Interact with designs", keys: ["I"] },

  selectAll: { group: "Selection", label: "Select all", keys: ["Ctrl A"] },
  selectInverse: { group: "Selection", label: "Select inverse", keys: ["Ctrl Shift A"] },
  selectMatching: { group: "Selection", label: "Select matching layers", keys: ["Ctrl Alt A"] },
  nextDesign: { group: "Selection", label: "Next design", keys: ["N"] },
  previousDesign: { group: "Selection", label: "Previous design", keys: ["Shift N"] },
  selectChildren: { group: "Selection", label: "Select the first layer inside", keys: ["Enter"] },
  selectParent: { group: "Selection", label: "Select the parent", keys: ["Shift Enter", "\\"] },
  selectNext: { group: "Selection", label: "Select the next layer", keys: ["Tab"] },
  selectPrevious: { group: "Selection", label: "Select the previous layer", keys: ["Shift Tab"] },
  back: { group: "Selection", label: "Stop editing, then select the parent", keys: ["Esc"] },

  undo: { group: "Edit", label: "Undo", keys: ["Ctrl Z"] },
  redo: { group: "Edit", label: "Redo", keys: ["Ctrl Shift Z", "Ctrl Y"] },
  cut: { group: "Edit", label: "Cut", keys: ["Ctrl X"] },
  copy: { group: "Edit", label: "Copy", keys: ["Ctrl C"] },
  paste: { group: "Edit", label: "Paste", keys: ["Ctrl V"] },
  pasteOver: { group: "Edit", label: "Paste over selection", keys: ["Ctrl Shift V"] },
  duplicate: { group: "Edit", label: "Duplicate", keys: ["Ctrl D"] },
  delete: { group: "Edit", label: "Delete", keys: ["Del", "Backspace"] },
  copyStyle: { group: "Edit", label: "Copy style", keys: ["Ctrl Alt C"] },
  pasteStyle: { group: "Edit", label: "Paste style", keys: ["Ctrl Alt V"] },
  rename: { group: "Edit", label: "Rename", keys: ["Ctrl R", "F2"] },

  insert: { group: "Object", label: "Insert", keys: ["/", "Shift I"] },
  wrap: { group: "Object", label: "Wrap in layout", keys: ["Ctrl G", "Ctrl Alt G", "Shift A"] },
  unwrap: { group: "Object", label: "Unwrap layout", keys: ["Ctrl Shift G", "Alt Shift A", "Ctrl Backspace"] },
  makeComponent: { group: "Object", label: "Make component", keys: ["Ctrl Alt K"] },
  goToMain: { group: "Object", label: "Go to the main component", keys: ["Ctrl Alt Shift K"] },
  detach: { group: "Object", label: "Detach instance", keys: ["Ctrl Alt B"] },
  bringForward: { group: "Object", label: "Bring forward", keys: ["Ctrl ]"] },
  sendBackward: { group: "Object", label: "Send backward", keys: ["Ctrl ["] },
  bringToFront: { group: "Object", label: "Bring to front", keys: ["Ctrl Shift ]", "]"] },
  sendToBack: { group: "Object", label: "Send to back", keys: ["Ctrl Shift [", "["] },
  hide: { group: "Object", label: "Hide or show", keys: ["Ctrl Shift H"] },

  alignLeft: { group: "Arrange", label: "Align left", keys: ["Alt A"] },
  alignCenter: { group: "Arrange", label: "Align horizontal centers", keys: ["Alt H"] },
  alignRight: { group: "Arrange", label: "Align right", keys: ["Alt D"] },
  alignTop: { group: "Arrange", label: "Align top", keys: ["Alt W"] },
  alignMiddle: { group: "Arrange", label: "Align vertical centers", keys: ["Alt V"] },
  alignBottom: { group: "Arrange", label: "Align bottom", keys: ["Alt S"] },
  distributeHorizontal: { group: "Arrange", label: "Distribute horizontally", keys: ["Alt Shift H"] },
  distributeVertical: { group: "Arrange", label: "Distribute vertically", keys: ["Alt Shift V"] },
  nudge: { group: "Arrange", label: "Nudge", keys: ["←", "→", "↑", "↓"] },
  bigNudge: { group: "Arrange", label: "Big nudge", keys: ["Shift ←", "Shift →", "Shift ↑", "Shift ↓"] },

  zoomIn: { group: "View", label: "Zoom in", keys: ["Ctrl +", "+"] },
  zoomOut: { group: "View", label: "Zoom out", keys: ["Ctrl -", "-"] },
  zoomTo100: { group: "View", label: "Zoom to 100%", keys: ["Shift 0", "Ctrl 0"] },
  zoomToFit: { group: "View", label: "Zoom to fit", keys: ["Shift 1"] },
  zoomToSelection: { group: "View", label: "Zoom to selection", keys: ["Shift 2"] },
  panels: { group: "View", label: "Show or hide the panels", keys: ["Ctrl \\"] },
  showLayers: { group: "View", label: "Show Layers", keys: ["Alt 1"] },
  showComponents: { group: "View", label: "Show Components", keys: ["Alt 2"] },
  layoutGrid: { group: "View", label: "Layout grid", keys: ["Shift G"] },
  nextTab: { group: "View", label: "Next tab", keys: ["Ctrl Tab"] },
  previousTab: { group: "View", label: "Previous tab", keys: ["Ctrl Shift Tab"] },

  openFolder: { group: "File", label: "Open project folder", keys: ["Ctrl O"] },
  openFile: { group: "File", label: "Open project file", keys: ["Ctrl Shift O"] },
  save: { group: "File", label: "Save", keys: ["Ctrl S"] },
  saveCopy: { group: "File", label: "Save a copy", keys: ["Ctrl Shift S"] },
  exportSelection: { group: "File", label: "Export selected design", keys: ["Ctrl Shift E"] },
  closeTab: { group: "File", label: "Close tab", keys: ["Ctrl W"] },
  settings: { group: "File", label: "Settings", keys: ["Ctrl ,"] },

  actions: { group: "Help", label: "Search actions", keys: ["Ctrl K", "Ctrl /"] },
  shortcuts: { group: "Help", label: "Keyboard shortcuts", keys: ["Ctrl Shift ?"] },
  developerTools: { group: "Help", label: "Developer tools", keys: ["Ctrl Shift I"] }
} as const satisfies Record<string, Binding>

export type Command = keyof typeof keymap

/** Keys held while dragging or clicking, which the shortcuts list shows beside the commands. */
export const gestures: readonly { group: Group; label: string; keys: string; with: "drag" | "click" }[] = [
  { group: "Tools", label: "Pan the canvas", keys: "Space", with: "drag" },
  { group: "Tools", label: "Move a design without snapping", keys: "Ctrl", with: "drag" },
  { group: "Selection", label: "Select the deepest layer under the pointer", keys: "Ctrl", with: "click" }
]

/** Whether a key event is one of a binding's shortcuts. */
function isShortcut(event: KeyboardEvent, command: Command): boolean {
  return keymap[command].keys.some((keys) => matches(event, keys))
}

/** The binding, if any, a key event matches. */
export function shortcutFor(event: KeyboardEvent, commands: Iterable<Command>): Command | undefined {
  for (const command of commands) if (isShortcut(event, command)) return command
  return undefined
}
