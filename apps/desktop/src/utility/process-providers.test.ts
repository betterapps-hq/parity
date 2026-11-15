import type { DiscoveredServer, ServerFacts } from "@parity-app/extension-api"
import type { ProcessCaller, ProviderAsk } from "@parity-app/extensions"
import { createTelemetry, createTestSink, registeredEvents, type TestSink } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { traceWith } from "../shared/tracing.ts"
import { processProviders } from "./process-providers.ts"
import { forgetProject, listProcesses, trackProcess } from "./processes.ts"

let sink: TestSink

beforeEach(() => {
  sink = createTestSink()
  traceWith(
    createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
})

afterEach(() => {
  forgetProject("shop")
})

const portless: ProcessCaller = {
  projectId: "shop",
  extension: "@parity-app/extension-portless",
  permissions: { processes: [], observe: false },
  main: "/extensions/portless.mjs"
}

/** Storybook, as an extension started it, listening on 6006. */
function storybook(): void {
  trackProcess({
    id: "extension:@parity-app/extension-storybook:shop:storybook",
    owner: { kind: "extension", extension: "@parity-app/extension-storybook" },
    lifetime: "server",
    name: "Storybook",
    state: "running",
    projectId: "shop",
    project: "shop",
    endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" }
  })
}

/** A provider that answers only what a test gives it. */
function ask(methods: Partial<ProviderAsk>): ProviderAsk {
  return {
    addresses: () => Promise.resolve([]),
    discover: () => Promise.resolve([]),
    ...methods
  }
}

describe("address providers", () => {
  it("names a server with what a provider says, drops what it may not give, and opens the name", async () => {
    const providers = processProviders()
    const asked: ServerFacts[][] = []

    providers.register(
      portless,
      { kind: "addresses" },
      ask({
        addresses(servers) {
          asked.push(servers)

          return Promise.resolve(
            servers.map((server) => ({
              server: server.id,
              addresses: [
                { url: "https://storybook.shop.localhost", label: "storybook.shop", kind: "name", public: false },
                { url: "https://shop.example.dev", label: "public", kind: "tunnel", public: true }
              ]
            }))
          )
        }
      })
    )

    storybook()

    await vi.waitFor(async () => {
      expect((await listProcesses())[0]?.opens).toBe("https://storybook.shop.localhost")
    })
    expect(asked).toEqual([
      [
        {
          id: "@parity-app/extension-storybook:storybook",
          name: "Storybook",
          endpoint: { url: "http://localhost:6006", port: 6006, protocol: "http" }
        }
      ]
    ])
    expect((await listProcesses())[0]?.addresses).toEqual([
      {
        url: "https://storybook.shop.localhost",
        label: "storybook.shop",
        kind: "name",
        public: false,
        provider: "@parity-app/extension-portless"
      }
    ])
    expect(sink.named("processes.providerFailed").map((event) => event.attributes.reason)).toEqual(["refused"])

    // Taken away, it says nothing more of the server.
    providers.disposeAll("shop", portless.extension)
    expect((await listProcesses())[0]).toMatchObject({ addresses: [], opens: "http://localhost:6006" })
  })

  it("leaves out a provider that throws, and notes why", async () => {
    const providers = processProviders()
    storybook()
    providers.register(portless, { kind: "addresses" }, ask({ addresses: () => Promise.reject(new Error("No")) }))

    await vi.waitFor(() => expect(sink.named("processes.providerFailed")).toHaveLength(1))
    expect(sink.named("processes.providerFailed")[0]?.attributes).toMatchObject({ reason: "error", message: "No" })
    expect((await listProcesses())[0]?.addresses).toEqual([])
  })
})

describe("discovery providers", () => {
  const route: DiscoveredServer = {
    key: "storybook.shop",
    endpoint: { url: "http://localhost:6100", port: 6100, protocol: "http" },
    addresses: [{ url: "https://storybook.shop.localhost", label: "storybook.shop", kind: "name", public: false }]
  }

  it("keeps a provider's answer until it says it changed, and drops servers that aren't on this machine", async () => {
    const providers = processProviders()

    const elsewhere: DiscoveredServer = {
      ...route,
      key: "far",
      endpoint: { url: "http://10.0.0.4:80", port: 80, protocol: "http" }
    }

    const discover = vi.fn<ProviderAsk["discover"]>(() => Promise.resolve([route, elsewhere]))
    providers.register(portless, { kind: "discovery" }, ask({ discover }))

    const first = await providers.discover("shop", "/projects/shop")

    expect(first).toMatchObject({ providers: 1, cached: 0 })
    expect(first.servers.map((server) => server.key)).toEqual(["storybook.shop"])
    expect(first.servers[0]?.addresses?.[0]).toMatchObject({ provider: "@parity-app/extension-portless" })
    expect(providers.found("shop", "@parity-app/extension-portless:storybook.shop")?.endpoint.port).toBe(6100)

    expect(await providers.discover("shop", "/projects/shop")).toMatchObject({ cached: 1 })
    providers.changed(portless, "discovery")
    expect(await providers.discover("shop", "/projects/shop")).toMatchObject({ cached: 0 })
    expect(discover).toHaveBeenCalledTimes(2)
  })
})
