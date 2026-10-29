/** The shadcn example as the service would open it, with Storybook's own designs. `host.ts` gives it its type. */
declare module "virtual:parity/example-project" {
  const project: unknown
  export default project
}
