export { applyOp, applyPlain, type DocState, OpProblem } from "./apply.ts"

export { type ChangedBoards, changedBoards } from "./boards.ts"

export {
  addContainer,
  addNote,
  addReferences,
  type AgentApplied,
  applyAgentChanges,
  applyDocuments,
  applyOperations,
  changeFiles,
  changeSnapshot,
  changeTokens,
  designsLabel,
  removeContainer,
  reorderContainer,
  restoreCopy,
  setModes,
  setPosition,
  snapshotOf,
  snapshotOps,
  typeInContainer,
  updateContainer,
  updateContainers,
  updateNote,
  updateReference,
  updateView
} from "./callers.ts"

export { type CommentAnchor, diffFiles, type DocumentDiff, type FieldDiff } from "./diff.ts"

export { containerOps, fileOps } from "./diff-ops.ts"

export { designKey, splitKey } from "./keys.ts"

export {
  componentLibrary,
  type ContainerEntry,
  containerEntries,
  containerEntry,
  editFrame,
  type NoteEntry,
  noteEntries,
  noteEntry,
  type ReferenceEntry,
  reachableLibrary,
  referenceEntries,
  referenceEntry
} from "./lookups.ts"

export { createProjectDoc } from "./project-doc.ts"

export { Recorder } from "./recorder.ts"

export {
  createProjectSaver,
  type Persistence,
  type ProjectSaver,
  type SavedBaseline,
  saveDelay,
  type TokenWriter
} from "./saver.ts"

export * from "./types.ts"
