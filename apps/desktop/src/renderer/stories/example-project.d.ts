/** The shadcn example as the service would open it, served by Storybook. `host.ts` gives it its type. */
declare module "virtual:parity/example-project" {
  const project: unknown
  export default project
}
