// A project's code as TypeScript reads it: listing its components with a quick parse, confirming them with the type
// checker, and reading their props, with one program per project serving the checker and props.
export {
  componentOptions,
  type ComponentReport,
  type ComponentScan,
  findComponents,
  type FoundComponent,
  groupOf,
  reactProbe,
  relativePath,
  withReactProbe
} from "./checker.ts"

export {
  type ComponentList,
  type ComponentListEvent,
  type ComponentListStep,
  nextComponentList,
  typeCheckSummary
} from "./component-list.ts"

export { hasElementSources, type SourceMap, tagElementSources } from "./element-sources.ts"

export { type ConfigChange, configChange, type ConfigInputs, configInputs, type ConfigStamps } from "./config-inputs.ts"

export {
  type AppComponent,
  appComponents,
  type ComponentFinder,
  findAll,
  type ProgramSetup,
  reactFinder
} from "./finder.ts"

export {
  appFiles,
  type CheckedComponent,
  checkedAppFiles,
  checkedChanges,
  type CheckResult,
  componentIds,
  correctedSources,
  filesChanged,
  findAppComponents,
  importersOf,
  importSpecifiers,
  leftOutChanges,
  type ParsedComponent,
  readChangedFiles,
  rediscoveredFiles
} from "./listing.ts"

export {
  type CheckRequest,
  type ProgramCache,
  programCache,
  type ProgramCacheOptions,
  type ProgramRequest,
  type PropsRequest
} from "./program-cache.ts"

export { inferProps, propsFiles } from "./props.ts"

export { importAlias, type ProjectTsconfig, readTsconfig, resolvePathAlias, type TsconfigFile } from "./tsconfig.ts"
