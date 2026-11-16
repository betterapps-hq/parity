/** The shadcn example as the service would open it, with Storybook's own designs. `host.ts` gives it its type. */
declare module "virtual:parity/example-project" {
  const project: unknown
  export default project
}

/** The example's source files as text, by their path from its root, for the Code panel exploration to show. */
declare module "virtual:parity/example-sources" {
  const files: Record<string, string>
  export default files
}
