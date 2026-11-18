export {
  canSplit,
  close,
  type DockOperation,
  drop,
  followLink,
  openTab,
  type Point,
  show,
  type Side,
  splitRight,
  type Target,
  toMain,
  toWindow
} from "./decide.ts"

export { focusedGroup, type Group, groupOf, type Layout, mainGroup, type Where, whereIs } from "./layout.ts"

export { barOrder, inOrder, type Lens, lensForShortcut, type Unavailable } from "./lens.ts"

export {
  type Across,
  type Arrangement,
  type Bounds,
  defaultLayout,
  type JsonValue,
  type Parted,
  readLayout,
  type SavedGroup,
  type SavedLayout,
  savedLayoutSchema,
  saveLayout,
  type Split
} from "./saved.ts"

export { inFocus, isEmpty, type LensMark, type LensMenu, markOf, menuOf } from "./state.ts"
