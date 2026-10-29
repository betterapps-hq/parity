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
  appFiles,
  type CheckedComponent,
  checkedChanges,
  componentIds,
  filesChanged,
  findAppComponents,
  importersOf,
  type ParsedComponent,
  readChangedFiles
} from "./listing.ts"
export { inferProps, propsFiles } from "./props.ts"
export { type ProjectTsconfig, readTsconfig, resolvePathAlias, type TsconfigFile } from "./tsconfig.ts"
