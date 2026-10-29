import { selectedDesigns, selectedNodes } from "../selection.ts"
import { openDialog } from "./app-dialogs.ts"
import {
  activeSession,
  alignSelection,
  closeTab,
  copy,
  copySelectionStyle,
  cut,
  deleteSelection,
  detachSelection,
  distributeSelection,
  duplicateSelection,
  exportImages,
  goToMainComponent,
  hideSelection,
  nudge,
  openProjectFile,
  openProjectFolder,
  orderSelection,
  paste,
  pasteOver,
  pasteReplace,
  pasteSelectionStyle,
  redo,
  renameSelection,
  save,
  saveCopy,
  selectAdjacentDesign,
  selectChildren,
  makeComponent,
  selectedDesign,
  selectedInstance,
  selectedOwnLayer,
  selectEverything,
  selectInverse,
  selectMatching,
  selectParent,
  selectSibling,
  showPanelTab,
  stepBack,
  switchTab,
  toggleDeveloperTools,
  toggleLayoutGrid,
  undo,
  unwrapSelection,
  wrapSelection,
  zoomIn,
  zoomOut,
  zoomTo100,
  zoomToFit,
  zoomToSelection
} from "./commands.ts"
import type { Command } from "./keymap.ts"
import { togglePanels } from "./layout.ts"
import { openQuickInsert } from "./QuickInsert.tsx"

/**
 * What each shortcut in the keymap runs, for the key handlers and the actions search. `app` ones work anywhere in the
 * window, even in a text field; the rest act on the canvas, so typing and menus keep their keys. `available` says when
 * one applies: otherwise its keys do what they'd do anyway, as Tab moving focus.
 */
export interface Action {
  /** `event` is the key that ran it, for an action that acts on which of its keys was pressed. */
  run(event?: KeyboardEvent): unknown
  available?(): boolean
  scope?: "app"
  /** It acts on the key pressed, as the arrows nudge each their own way, so only its keys run it, not the search. */
  byKey?: boolean
}

const current = () => activeSession()?.selection.get()
const hasSession = () => !!activeSession()
const hasEditor = () => !!activeSession()?.editor
const hasDesign = () => !!current()?.design
const hasSomething = () => !!current()?.design || !!current()?.note
const layers = () => {
  const selection = current()
  return selection ? selectedNodes(selection).length : 0
}
const designs = () => {
  const selection = current()
  return selection && layers() === 0 ? selectedDesigns(selection).length : 0
}
const hasLayer = () => layers() > 0
const hasDesigns = () => (activeSession()?.store.getEntries().length ?? 0) > 0
const oneLayer = () => layers() === 1
const alignable = () => layers() > 0 || designs() > 1
const tool = (name: "select" | "hand" | "text" | "interact"): Action => ({
  run: () => activeSession()?.selection.setTool(name),
  available: hasSession
})

export const actions: Record<Command, Action> = {
  select: tool("select"),
  hand: tool("hand"),
  text: tool("text"),
  interact: tool("interact"),

  selectAll: { run: () => selectEverything(), available: hasSession },
  selectInverse: { run: () => selectInverse(), available: hasSession },
  selectMatching: { run: () => selectMatching(), available: () => hasLayer() || designs() > 0 },
  nextDesign: { run: () => selectAdjacentDesign(1), available: hasDesigns },
  previousDesign: { run: () => selectAdjacentDesign(-1), available: hasDesigns },
  selectChildren: { run: () => selectChildren(), available: hasDesign },
  selectParent: { run: () => selectParent(), available: hasLayer },
  selectNext: { run: () => selectSibling(1), available: hasLayer },
  selectPrevious: { run: () => selectSibling(-1), available: hasLayer },
  back: { run: () => stepBack(), available: hasSession },

  undo: { run: () => undo(), available: () => !!activeSession()?.store.getHistory().canUndo },
  redo: { run: () => redo(), available: () => !!activeSession()?.store.getHistory().canRedo },
  cut: { run: () => cut(), available: hasSomething },
  copy: { run: () => copy(), available: hasSomething },
  paste: { run: () => paste(), available: hasSession },
  pasteOver: { run: () => pasteOver(), available: () => hasLayer() || designs() > 0 },
  pasteReplace: { run: () => pasteReplace(), available: hasLayer },
  duplicate: { run: () => duplicateSelection(), available: hasDesign },
  delete: { run: () => deleteSelection(), available: hasSomething },
  copyStyle: { run: () => copySelectionStyle(), available: hasLayer },
  pasteStyle: { run: () => pasteSelectionStyle(), available: hasLayer },
  rename: { run: () => renameSelection(), available: hasDesign },

  insert: { run: openQuickInsert, available: hasSession },
  wrap: { run: () => wrapSelection(), available: hasLayer },
  unwrap: { run: () => unwrapSelection(), available: oneLayer },
  makeComponent: { run: () => makeComponent(), available: () => !!selectedDesign() || !!selectedOwnLayer() },
  goToMain: { run: () => goToMainComponent(), available: () => !!selectedInstance() },
  detach: { run: () => detachSelection(), available: () => !!selectedInstance() },
  bringForward: { run: () => orderSelection("forward"), available: oneLayer },
  sendBackward: { run: () => orderSelection("backward"), available: oneLayer },
  bringToFront: { run: () => orderSelection("front"), available: oneLayer },
  sendToBack: { run: () => orderSelection("back"), available: oneLayer },
  hide: { run: () => hideSelection(), available: hasLayer },

  alignLeft: { run: () => alignSelection("left"), available: alignable },
  alignCenter: { run: () => alignSelection("center"), available: alignable },
  alignRight: { run: () => alignSelection("right"), available: alignable },
  alignTop: { run: () => alignSelection("top"), available: alignable },
  alignMiddle: { run: () => alignSelection("middle"), available: alignable },
  alignBottom: { run: () => alignSelection("bottom"), available: alignable },
  distributeHorizontal: { run: () => distributeSelection("horizontal"), available: () => designs() >= 3 },
  distributeVertical: { run: () => distributeSelection("vertical"), available: () => designs() >= 3 },
  nudge: { run: (event) => nudge(event), available: hasSomething, byKey: true },
  bigNudge: { run: (event) => nudge(event), available: hasSomething, byKey: true },

  zoomIn: { run: () => zoomIn(), available: hasEditor },
  zoomOut: { run: () => zoomOut(), available: hasEditor },
  zoomTo100: { run: () => zoomTo100(), available: hasEditor },
  zoomToFit: { run: () => zoomToFit(), available: hasEditor },
  zoomToSelection: { run: () => zoomToSelection(), available: hasSomething },
  panels: { run: togglePanels, scope: "app" },
  // Not in text fields, where Alt and a digit can type a character.
  showLayers: { run: () => showPanelTab("layers") },
  showComponents: { run: () => showPanelTab("components") },
  layoutGrid: { run: toggleLayoutGrid },
  nextTab: { run: () => switchTab(1), scope: "app" },
  previousTab: { run: () => switchTab(-1), scope: "app" },

  openFolder: { run: openProjectFolder, scope: "app" },
  openFile: { run: openProjectFile, scope: "app" },
  save: { run: () => save(), available: hasSession, scope: "app" },
  saveCopy: { run: () => saveCopy(), available: hasSession, scope: "app" },
  exportSelection: { run: () => exportImages("selection"), available: hasSession, scope: "app" },
  closeTab: { run: () => closeTab(), scope: "app" },
  settings: { run: () => openDialog("settings"), scope: "app" },

  actions: { run: () => openDialog("actions"), scope: "app" },
  shortcuts: { run: () => openDialog("shortcuts"), scope: "app" },
  developerTools: { run: toggleDeveloperTools, scope: "app" }
}
