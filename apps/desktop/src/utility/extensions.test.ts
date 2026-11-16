import type { ExtensionHosts } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import { closeExtensions, type ExtensionProject, projectProviders } from "./extensions.ts"
import type { ProviderProject } from "./projects.ts"

/** Hosts that only note what they're told, and answer every provider call with nothing. */
function notingHosts() {
  const told: ExtensionProject[] = []

  const fake: Pick<ExtensionHosts<ExtensionProject>, "open" | "provide" | "provider" | "close"> = {
    open: (project) => void told.push(project),
    provide: async () => undefined,
    provider: () => undefined,
    close: async () => undefined
  }

  // SAFETY: the providers and closing call only these four, which the fake gives.
  return { told, hosts: fake as ExtensionHosts<ExtensionProject> }
}

const project: ProviderProject = { root: "/shop", name: "shop", pkg: { name: "shop" } }

describe("projectProviders (PAR-1095)", () => {
  it("tells the hosts once as the package is read, and again once detection finds a tool's entities", async () => {
    const { told, hosts } = notingHosts()
    const providers = projectProviders(hosts)
    await providers.call(project, { kind: "router", method: "routes" })
    await providers.call(project, { kind: "router", method: "routes" })
    await providers.call(
      { ...project, entities: ["storybook"] },
      { kind: "entities", method: "import", params: { components: {} } }
    )
    await providers.call(
      { ...project, entities: ["storybook"] },
      { kind: "entities", method: "import", params: { components: {} } }
    )

    expect(told.map((each) => each.entities)).toEqual([undefined, ["storybook"]])
  })

  // A project closed and opened again tells its new hosts of its Storybook afresh.
  it("forgets what it told the hosts once the project closes", async () => {
    const { told, hosts } = notingHosts()
    const providers = projectProviders(hosts)
    const bakery: ProviderProject = { root: "/bakery", name: "bakery", pkg: { name: "bakery" } }
    const storybook = { ...bakery, entities: ["storybook"] }
    await providers.call(storybook, { kind: "entities", method: "import", params: { components: {} } })
    await closeExtensions(hosts, bakery.root)
    await providers.call(bakery, { kind: "router", method: "routes" })
    await providers.call(storybook, { kind: "entities", method: "import", params: { components: {} } })

    expect(told.map((each) => each.entities)).toEqual([["storybook"], undefined, ["storybook"]])
  })
})
