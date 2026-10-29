// Finding components with the type checker lives in @parity/code, which the desktop app's checker shares (PKG-3). This
// keeps libgen's own imports of it as they were.
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
} from "@parity/code"
