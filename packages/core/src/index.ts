export {
  type BuilderAdapter,
  type BuilderDetection,
  type BuilderRenderer,
  type BuilderSession,
  type BuilderStartOptions,
  type ClassPrinter,
  type CodeChange,
  type ComponentExport,
  type DrawnNodes,
  type ExportsTarget,
  type FrameViewport,
  type Guest,
  type GuestDecorators,
  type GuestIconSet,
  type GuestInit,
  type LayerFailure,
  type MountHandle,
  type MountOptions,
  packageManifest,
  type PackageManifest,
  parseManifest,
  type ProjectRoute,
  type RendererAdapter,
  type RouterAdapter,
  scriptConfigExtensions,
  type StylesAdapter,
  type ThemeVariable,
  type TokenWrite
} from "./adapters.ts"

export { boardLayoutAt, boardSize, companionScale, gutterScale, shrinkBelow } from "./board.ts"

export {
  bodyAttribute,
  collectCustomProperties,
  colorSchemeAttribute,
  colorSchemeQuery,
  type CustomPropertyDeclaration,
  type EnclosingAtRule,
  prepareCanvasCss,
  qualifiedRootLayer,
  remProperty,
  resetCustomProperties,
  rewriteFrameUnits,
  rewriteSheetFrameUnits,
  rootFontSizeProperty,
  viewportContainerName,
  viewportHeightProperty,
  viewportWidthProperty
} from "./css.ts"

export { extractComponent, findRepeats, type RepeatCandidate } from "./decompose.ts"

export { addDesigns, emptyDocument, removeDesigns } from "./designs.ts"

export { type ChangeConflict, describeConflicts, type DesignChange, type ModesChange } from "./design-change.ts"

export { deviceForWidth, type DeviceKind, devicePresets, lengthToPixels, screenHeightForWidth } from "./devices.ts"

export {
  canvasDocument,
  type CanvasDocument,
  type ComponentNode,
  type ComponentRef,
  type ContainerKind,
  containerKinds,
  containerSpec,
  type ContainerSpec,
  type ContainerViewSettings,
  type DesignNode,
  designStates,
  detectionCorrections,
  type DetectionCorrections,
  formatVersion,
  type FrameSize,
  imageCredit,
  type ImageCredit,
  type ImageDetails,
  type ImageNode,
  includeComponent,
  type InstanceNode,
  isAccessibilityProp,
  type LayoutNode,
  type NodePatch,
  nodeTree,
  noteSpec,
  type NoteSpec,
  type ParamSpec,
  paramTypes,
  parseCanvasDocument,
  patchUnset,
  type PropValues,
  type ReferenceSpec,
  type StateSpec,
  type TextNode,
  textTags,
  type VariantOption,
  type VideoNode,
  walkNodes
} from "./document.ts"

export {
  addState,
  addVariant,
  boardTarget,
  changeCount,
  changesField,
  childEntries,
  childNodes,
  deleteNode,
  dropPatches,
  duplicateState,
  editNode,
  editResponsive,
  editsDesign,
  type EditTarget,
  editTargetName,
  findNode,
  findState,
  generateId,
  hiddenOnBoard,
  insertNode,
  isBaseState,
  locateNode,
  mapChildLists,
  mapNode,
  mapNodes,
  moveNode,
  moveNodes,
  type NodeChange,
  nodeIds,
  nodeInState,
  nodeLabel,
  nodeOnBoard,
  type PatchField,
  patchSize,
  propChange,
  refuseUnlessComponent,
  removeParam,
  removeState,
  renameState,
  resetOverride,
  targetPatches,
  tidyPatch,
  toEditTarget,
  toggleHidden,
  topmostNodes,
  unwrapNode,
  withFreshIds,
  wrapNodes
} from "./edit.ts"

export { effectiveNode, effectiveTree, type EffectiveTree, locateEffective } from "./effective.ts"

export {
  type ElementSource,
  elementSourceAttribute,
  formatElementSource,
  parseElementSource
} from "./element-source.ts"

export {
  alternativeLimit,
  closest,
  CodedError,
  errorDetails,
  type ErrorDetails,
  readErrorDetails,
  unknownReference
} from "./errors.ts"

export {
  applyFieldInput,
  type FieldRules,
  readFieldInput,
  remPixels,
  scrubSteps,
  snapToSpacingGrid,
  stepFieldValue
} from "./fields.ts"

export {
  frameRules,
  type FrameRulesOptions,
  previewRules,
  withClasses,
  writeClasses,
  type WrittenClasses
} from "./frame-rules.ts"

export { componentRole, type ComponentRole, groupComponents, type LeftOutExport, pageRoute } from "./grouping.ts"

export {
  codeChangeVersions,
  guestChanges,
  type GuestChanges,
  type GuestComponentSource,
  versionedSources
} from "./guest-changes.ts"

export { iconAliases, iconStyleModules, iconVariants, shorterName } from "./icon-names.ts"

export {
  detachInstance,
  editInner,
  innerChanges,
  type InnerNode,
  isInnerPath,
  layerOnBoard,
  locateInner,
  overrideCount,
  pushOverrides,
  resetInner,
  resetInstance,
  swapInstance
} from "./instances.ts"

export { componentNode, librarySource, withLibraryContext } from "./library-insert.ts"

export {
  applyLibraryEdits,
  type ComponentEvidence,
  type ComponentSample,
  type DecoratorElement,
  isSampleText,
  type LibraryBreakpoint,
  libraryCanvas,
  type LibraryComponent,
  type LibraryComponents,
  type LibraryDecorator,
  libraryDesigns,
  type LibraryEdits,
  type LibraryIcons,
  libraryId,
  libraryImports,
  libraryManifest,
  type LibraryManifest,
  libraryManifestExtension,
  libraryPackage,
  type ParentSignal,
  parseLibraryEdits,
  parseLibraryManifest,
  remapLibraryImports,
  type SampleChild,
  type SampleElement,
  type SampleRender,
  withLibraryCanvas
} from "./library.ts"

export { designModes, type DesignModes, modesReport, type ModesReport } from "./mode-report.ts"

export {
  defaultModeSettings,
  isTouchMode,
  modeDevice,
  modeGlobals,
  modeSettings,
  type ModeSettings,
  type ModeSpec,
  type ModeVariable,
  previewMode,
  type ResolvedMode,
  resolveMode,
  resolveModes,
  shownModes,
  uniqueId,
  type VariableOption
} from "./modes.ts"

export { type OwnFields, setOwnFields } from "./own-fields.ts"

export {
  addParam,
  type ArgChange,
  bindingProblem,
  bindNode,
  changeArgs,
  deleteParam,
  renameParam,
  updateParam
} from "./params.ts"

export {
  type ComponentSource,
  type DescribedTokens,
  type LibraryInfo,
  type OpenProp,
  type ProjectConfig,
  type StorybookInfo,
  type StoryFile
} from "./project.ts"

export { addValueProp, bindText, propFromText, propNameProblem, textProps, type ValuePropType } from "./prop-binding.ts"

export {
  type ComponentInfo,
  type ComponentProp,
  nodePropInput,
  type PropGroup,
  type PropKind,
  propsPanel
} from "./props.ts"

export { type ComponentRenderStatus, describeRenderStatus, renderProblem } from "./render-status.ts"

export {
  boardRoot,
  componentLibrary,
  type ComponentLibrary,
  drawnNode,
  type ElementAttributes,
  emptyLayoutAttribute,
  type EvalContext,
  type EvalScope,
  frameGeometry,
  type FrameGeometry,
  frameSize,
  frameViewport,
  projectComponentLibrary,
  reachableLibrary,
  type RenderComponent,
  renderedComponents,
  type RenderElement,
  type RenderNode,
  resolveDesign,
  scopeOf,
  variantChoices,
  withoutEmptyLayoutMarks
} from "./render.ts"

export {
  fileObject,
  finiteNumber,
  type InvalidData,
  jsonText,
  jsonValue,
  type JsonValue,
  nonBlankString,
  onInvalidData,
  parseData,
  parseInput,
  parserFor,
  plainObject
} from "./schema.ts"

export { slotName } from "./slot-names.ts"

export {
  clearSlot,
  type DesignSlot,
  designSlots,
  fillSlotWithComponent,
  fillSlotWithLayer,
  freeSlotName,
  type InstanceSlot,
  instanceSlots,
  setSlot,
  slotAtPath,
  type SlotCandidate,
  slotCandidates,
  slotComponents,
  slotPlaceProblem,
  slotProblem
} from "./slots.ts"

export { type DescribedToken, type TokenCategory, type TokenExtension } from "./token-types.ts"

export {
  evaluateValue,
  exportOf,
  isMadeValue,
  isSampleElement,
  isSampleRender,
  renderSlotKey,
  renderSlotOf,
  type ValueHost,
  valueImports
} from "./values/evaluate.ts"

export { type MadeValue } from "./values/grammar.ts"

// The stored style's schema and its CSS are `@parity-app/style-schema`'s. What the rest of Parity reads of them comes through
// here, so a package that holds documents needs only core.
export {
  type Alpha,
  alphaPercent,
  type BorderWidth,
  borderWidthPixels,
  type Color,
  colorCss,
  colorToken,
  type CssMap,
  type FieldLength,
  fieldLength,
  fieldSize,
  fillCss,
  type Fills,
  type FillStyle,
  fillToken,
  type FillTokens,
  fillTokens,
  type Filter,
  type FontWeight,
  fontWeightNumber,
  type FilterAdjustment,
  filterAdjustments,
  gradientCss,
  type GradientKind,
  gradientKinds,
  type GradientPaint,
  type ImagePaint,
  isEasingFunction,
  isEasingKeyword,
  isFill,
  isHug,
  isNamedLength,
  isSpring,
  isTransitionSet,
  type Length,
  lengthField,
  lengthSteps,
  lengthToken,
  type LineHeight,
  type Named,
  namedCss,
  type NodeStyle,
  nodeStyle,
  type Opacity,
  opacityPercent,
  type Padding,
  type Paint,
  type PaintFit,
  paintFits,
  type PaintStop,
  radiusKeywords,
  type Scale,
  type Shadow,
  type Size,
  solidFill,
  type SolidPaint,
  spacing,
  spacingSteps,
  springLinear,
  springSamples,
  springSettle,
  type StyleKey,
  styleKeys,
  type Time,
  token,
  tokenColor,
  type TokenGradientPaint,
  type Track,
  type TransformFunction,
  type TransformStyle,
  type Transition,
  type Translate,
  withAlpha
} from "@parity-app/style-schema"
