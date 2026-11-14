export {
  alignBoxes,
  alignInLayouts,
  type Alignment,
  copyLayersInPlace,
  type DesignBox,
  type DesignRef,
  distributeBoxes,
  type Order,
  removeLayers,
  reorderLayer,
  repositionDesigns,
  siblingsOf,
  topLayers,
  unwrapLayout,
  wrapInLayout
} from "./arrange.ts"

export { type BoardBox, type LabelKind, labelLook, stateLabelSpace, titleReach } from "./canvas-labels.ts"

export {
  applyStyle,
  asShown,
  type ClipboardEnvelope,
  type ClipboardPayload,
  copyDesigns,
  copyLayers,
  copyLayersInto,
  copyNotes,
  isParityCopy,
  isSvgMarkup,
  missingComponents,
  pasteTarget,
  type PasteTarget,
  readEnvelope,
  styleOf,
  textLayer,
  writeEnvelope
} from "./clipboard.ts"

export {
  componentPreviewTree,
  componentUses,
  missingProps,
  type PreviewContext,
  previewFrameWidth,
  previewProblem,
  type PreviewProblem,
  previewRootId,
  previewVariants,
  slotPreviewTree
} from "./component-preview.ts"

export { makeComponent } from "./components.ts"

export { componentComposition, type ComponentComposition } from "./composition.ts"

export { newDesign } from "./create.ts"

export {
  addDesign,
  addNote,
  changeDesign,
  changeDesigns,
  changeNote,
  deleteDesign,
  mergeAgentChanges,
  moveDesign,
  type ReferenceAdded,
  reorderDesign,
  replaceDocuments
} from "./design-changes.ts"

export { designColors } from "./design-colors.ts"

export { withTidyView } from "./document-equality.ts"

export {
  countMedia,
  designOfMedia,
  dropHint,
  dropLabel,
  type DroppedFile,
  fileBaseName,
  type FileMedium,
  limitOf,
  mayBeMedia,
  mediaAccept,
  type MediaCount,
  mediaExtension,
  mediaKinds,
  mediaWords,
  mediumOfType,
  megabytes,
  skippedMessage,
  sortDrop,
  type TakenFile,
  videoLimit
} from "./drop-files.ts"

export { type Box, flowOf, type Point, type Rect, type Slot } from "./drop-slot.ts"

export {
  type DropTarget,
  dropTargetAt,
  frameLayout,
  type FrameLayout,
  type MeasuredLayer,
  type MoveTarget
} from "./drop-target.ts"

export { activeState, editFrame, type EditFrame, editingState, type Picked } from "./edit-frame.ts"

export {
  copyScale,
  defaultExportSizes,
  describeFiles,
  exportFiles,
  type ExportSize,
  nextExportSize,
  planExport,
  planPicture
} from "./export-files.ts"

export { findAnything, type FindItem, rememberPick } from "./find-anything.ts"

export {
  clickedFrameSize,
  detachInstancesOf,
  draggedBox,
  drawnFrame,
  fittedFrame,
  fitsDrawn,
  frameOfText,
  type FramePreset,
  framePresets,
  frameRootShown,
  frameRootStored,
  hugsContent,
  instanceCount,
  snapToEdges,
  textFrameRenamed,
  withFrameSize
} from "./frames.ts"

export { type Edge, handleBoxes } from "./handles.ts"

export {
  changedBesides,
  type ChangeOptions,
  checkpoint,
  type Checkpoint,
  type DesignHistory,
  type DesignSnapshot,
  type DesignStep,
  endGesture,
  fileWrite,
  type FileWrite,
  type HistoryEntry,
  historyLimit,
  type HistoryState,
  mergedDocument,
  openDesigns,
  recordChange,
  redoChange,
  reloadFile,
  revertTo,
  saveFailure,
  type SaveState,
  startSave,
  type TokenFailure,
  undoChange,
  unsavedPaths,
  withStylesheet,
  writeFailed,
  writeStarted,
  writeSucceeded
} from "./history.ts"

export { openingDesigns } from "./home.ts"

export {
  compareRanked,
  hiddenHeading,
  hiddenReason,
  type HiddenReason,
  type InsertOption,
  type InsertOrigin,
  type InsertRow,
  insertRows,
  isLate,
  searchOption
} from "./insert-search.ts"

export {
  componentLabel,
  type InsertAt,
  type InsertContext,
  insertIntoDesign,
  type InsertItem,
  insertLabel,
  nodeForItem,
  readInsertItem,
  whereToInsert
} from "./insert.ts"

export { kindName, kindsName, kindTitle } from "./kind-names.ts"

export { type DroppedParts, turnInto } from "./kinds.ts"

export {
  type Capabilities,
  type CapabilityDesign,
  designCapabilities,
  type InspectorSection,
  panelParts,
  selectionCapabilities,
  type StyleControl,
  styleParts,
  type StyleSection,
  type TakesStyle
} from "./layer-capabilities.ts"

export {
  branchIds,
  closedTree,
  expandedRows,
  layerRowId,
  revealIds,
  revealRows,
  searchRows,
  siblingIds,
  toggleRow,
  toggleRows,
  type TreeRow,
  treeRows
} from "./layers-tree.ts"

export {
  type FolderedRow,
  folderId,
  folderIds,
  type FolderRow,
  folderTree,
  type FolderTreeRow
} from "./layers-folders.ts"

export {
  designsLocked,
  isLocked,
  layersLocked,
  lockableIds,
  lockSource,
  type LockSource,
  setDesignLocked,
  toggleLockedLayers,
  unlockedPath
} from "./locking.ts"

export { fitPicture, packWall, type PictureSize, type Stretch, tallnessOf } from "./media-wall.ts"

export { moveLayersAcross, moveLayersWithin, readLayersDrag } from "./move-layers.ts"

export {
  absoluteDrag,
  type Arrow,
  arrowOf,
  dragThreshold,
  type Drawn,
  type DrawnSteps,
  frameResize,
  frameSizeReset,
  layerResize,
  type LayerResizeStart,
  layerSizeReset,
  type LayerSnapStart,
  type LayersNudge,
  layersResize,
  nudgedPosition,
  nudgeLayers,
  resizeStart,
  type StyleChange,
  withFrame
} from "./move-resize.ts"

export { type DesignName, designOfItem, designOfLayers } from "./new-screen.ts"

export { drawsOver, measuresNext, movesOnlyTheView, overlayDesigns, settleUntil } from "./overlay-measuring.ts"

export {
  decidePaste,
  noLayoutHere,
  type PasteAction,
  type PasteAsk,
  type PasteContent,
  type PasteHow,
  type PasteRefusal,
  pasteStepName
} from "./paste-decision.ts"

export { type HereLayout, type HereSlot, pasteHere, slotHere } from "./paste-here.ts"

export { designsAt, placeOver, replaceLayers, selectionToPasteOn } from "./paste-over.ts"

export {
  aboveEverything,
  type Bounds,
  designGap,
  freeSpotBeside,
  panToShow,
  pastedPlacement,
  rightOfEverything,
  viewMargin
} from "./placement.ts"

export {
  cantRemove,
  codeFilesUsing,
  type CodeFileUse,
  type CodeReference,
  codeReferences,
  designsUsing,
  type DesignUse,
  filterImages,
  findImage,
  findUses,
  type ImageFile,
  imageItem,
  type ImageMedium,
  imagesFolder,
  inUse,
  keepImageDetails,
  mediaFolderOf,
  mediaFolders,
  mediumOf,
  type ProjectImage,
  projectImages,
  removalOf,
  usesOnCard,
  videosFolder
} from "./project-images.ts"

export { readRecoveryCopy, recoveryCopy, type RecoveryCopy, recoveryCopySchema, restoreRecovery } from "./recovery.ts"

export {
  addReferences,
  changeReference,
  type FoundScreen,
  moreFromApp,
  nearestBox,
  type ReferenceAnchor,
  referenceBounds,
  referenceExpired,
  referenceFrom,
  referenceRow,
  referenceSearch,
  type ReferenceSearch,
  referenceSize
} from "./references.ts"

export { designFailures, failureAdvice, layerFailure } from "./render-failures.ts"

export {
  type AnnotationKind,
  annotationKinds,
  isReviewTool,
  pickReview,
  type Review,
  type ReviewTool,
  reviewToolFor,
  startReview,
  stopReview
} from "./review.ts"

export {
  designsSelection,
  layersSelection,
  sameSelection,
  selectedDesigns,
  selectedNodes,
  type Selection,
  selectionKey,
  toggleLayer
} from "./selection.ts"

export { boardReader } from "./shown.ts"

export { type DrawnBox, frameSkeleton, type FrameSkeleton } from "./skeleton.ts"

export {
  distancesBetween,
  EvenSpacing,
  type LayerSnapped,
  type LayerSnapScene,
  snapBox,
  type SnapBox,
  type SnapGuide,
  snapLayer,
  type SnapPoint,
  snaps,
  type SnapSpacing
} from "./snap.ts"

export {
  type LengthToken,
  type PaddingSide,
  paddingSides,
  pickedSpacing,
  type SidesHeld,
  spacingDrag,
  type SpacingEdit,
  type SpacingEditStart,
  type SpacingHandle,
  spacingHandles,
  type SpacingLayout,
  spacingName,
  spacingScaleName,
  spacingStep,
  typedSpacing
} from "./spacing-handles.ts"

export { editStatus, type EditStatus, type StatusOptions } from "./status.ts"

export { styleChanges } from "./style-changes.ts"

export {
  fillEdit,
  type LayerMeasure,
  layoutTypeEdit,
  placementEdit,
  type RowKey,
  shownSize,
  sidesOf,
  sizeEdit,
  type StackingContext,
  type StyleEdit,
  type StyleRow,
  styleRows,
  styleSelection,
  type StyleSelection,
  styleValues,
  type StyleValues,
  tidySides
} from "./style-editing.ts"

export {
  editableText,
  openingSelection,
  type TextRange,
  textSizing,
  textToEdit,
  withEditedText
} from "./text-editing.ts"

export {
  noTokenEdits,
  type TokenChange,
  tokenDifferences,
  type TokenEdit,
  type TokenEdits,
  tokensWithEdits,
  type TokenWrite,
  withTokenEdits,
  withTokenOverrides
} from "./token-edits.ts"

export { holdZoom, zoomHeldFrom, zoomSettled } from "./zoom-settle.ts"

export {
  pageFrameName,
  pageGroupBox,
  pageHeightMessage,
  pageLandedMessage,
  landedElsewhere,
  type PageLayout,
  pageLinkLine,
  pageLinksLit,
  type PageMode,
  pageName,
  type PageNode,
  pageTree,
  type PlacedPage,
  placePages,
  routeLayers,
  type RouteGroup,
  type RouteScreen,
  type RouteTree,
  routeScreenId,
  routeScreens,
  routeTree,
  samplePath,
  treeDepth
} from "./route-boards.ts"

export {
  type BoardLayout,
  boardGroups,
  boardsHeight,
  type ComponentBoard,
  componentBoardId,
  boardComponentLayer,
  boardComponentNode,
  boardWithInternals,
  componentBoards,
  redrawnBoards
} from "./component-boards.ts"

export { type BoardParents, nextBoardParents, noBoardParents } from "./board-parents.ts"

export {
  type ElementLayerType,
  elementLayers,
  elementLayerType,
  type ElementSnapshot,
  layerName,
  readStyles,
  styleOfElement
} from "./element-layers.ts"

export { hasTriedSize, withoutTriedSize } from "./tried-size.ts"
