import type { Connector, Fetch, FindKind, Found, SearchRequest } from "@parity-app/connectors"
import { describe, expect, it } from "vite-plus/test"
import type { ConnectorState } from "../shared/connectors.ts"
import type { KeptKey, KeyStore } from "./connector-keys.ts"
import { type ConnectorHubOptions, createConnectorHub, type SearchService, type Searched } from "./connectors.ts"

/** A connector that finds one screen with the key "good", and answers other keys as `refuse` says. */
function fakeConnector(
  refuse: "key-refused" | "no-access" | "unavailable" = "key-refused",
  id = "fake",
  finds: FindKind = "screens"
) {
  const keys: (string | undefined)[] = []
  const picked: Found[] = []

  const connector: Connector = {
    info: {
      id,
      name: "Fake",
      site: "https://fake.example",
      finds: [finds],
      filters: [],
      limit: { default: 10, max: 10 },
      more: "exclude"
    },
    probe: { query: "login", kind: finds, limit: 1 },
    async picked(found) {
      picked.push(found)
    },
    async search(_request, access) {
      keys.push(access.key)

      if (access.key === "good") {
        return {
          found: [
            {
              connector: id,
              id: "1",
              kind: "screens",
              title: "App",
              image: { url: "https://fake.example/1.png" },
              link: "https://fake.example/1",
              credit: [{ name: "App" }]
            }
          ]
        }
      }

      return { problem: { code: refuse, message: refuse } }
    }
  }

  return { connector, keys, picked }
}

function memoryKeys(persistent = true): KeyStore {
  const kept = new Map<string, KeptKey>()

  return {
    read: async () => Object.fromEntries(kept),
    async set(id, key) {
      const source = persistent ? "saved" : "session"
      kept.set(id, { key, source })

      return source
    },
    async clear(id) {
      kept.delete(id)
    }
  }
}

const fetch: Fetch = () => Promise.reject(new Error("no network in tests"))

function hub(
  connector: Connector | Connector[],
  keys = memoryKeys(),
  environment: Record<string, string> = {},
  more: Partial<ConnectorHubOptions> = {}
) {
  const changes: ConnectorState[][] = []
  const secrets: string[][] = []
  const searches: Searched[] = []
  let clock = 0

  const made = createConnectorHub({
    connectors: Array.isArray(connector) ? connector : [connector],
    keys,
    environment,
    fetch,
    timeout: 1000,
    changed: (states) => changes.push(states),
    secrets: (values) => secrets.push(values),
    searched: (search) => searches.push(search),
    now: () => (clock += 5),
    ...more
  })

  return { hub: made, changes, secrets, searches }
}

const search: SearchRequest = { query: "login", kind: "screens" }

describe("createConnectorHub", () => {
  it("lists each connector with where its key comes from, and searches with that key", async () => {
    const { connector, keys } = fakeConnector()
    const { hub: connectors } = hub(connector)

    expect((await connectors.states()).map(({ id, key }) => [id, key])).toEqual([["fake", "none"]])
    await connectors.setKey("fake", "good")
    expect((await connectors.states())[0]?.key).toBe("saved")
    expect(await connectors.search("fake", search, "window")).toHaveProperty("found")
    expect(keys.at(-1)).toBe("good")
  })

  it("checks a key before keeping it, and keeps none the source turns down or whose plan can't search", async () => {
    for (const refuse of ["key-refused", "no-access"] as const) {
      const { connector } = fakeConnector(refuse)
      const { hub: connectors, changes } = hub(connector)

      expect(await connectors.setKey("fake", "bad")).toEqual({ problem: { code: refuse, message: refuse } })
      expect((await connectors.states())[0]?.key).toBe("none")
      expect(changes).toHaveLength(0)
    }
  })

  it("keeps a key it couldn't check, saying why", async () => {
    const { connector } = fakeConnector("unavailable")
    const { hub: connectors } = hub(connector)

    expect(await connectors.setKey("fake", "unchecked")).toEqual({
      key: "saved",
      problem: { code: "unavailable", message: "unavailable" }
    })
  })

  it("says a key lasts only until Parity quits where the system can't encrypt it", async () => {
    const { connector } = fakeConnector()
    const { hub: connectors } = hub(connector, memoryKeys(false))

    expect(await connectors.setKey("fake", "good")).toEqual({ key: "session" })
  })

  it("uses the environment's key over a saved one, and says so", async () => {
    const { connector, keys } = fakeConnector()
    const { hub: connectors } = hub(connector, memoryKeys(), { fake: "good" })

    expect(await connectors.setKey("fake", "good")).toEqual({ key: "environment" })
    await connectors.search("fake", search, "window")
    expect(keys.at(-1)).toBe("good")
  })

  it("tells the windows and the scrubber when keys change, and forgets a cleared key", async () => {
    const { connector } = fakeConnector()
    const { hub: connectors, changes, secrets } = hub(connector)

    await connectors.setKey("fake", "good")
    await connectors.clearKey("fake")

    expect(changes.map((states) => states[0]?.key)).toEqual(["saved", "none"])
    expect(secrets).toEqual([["good"], []])
  })

  it("names the connectors it has when asked for one it doesn't", async () => {
    const { connector } = fakeConnector()
    const { hub: connectors } = hub(connector)

    expect(await connectors.search("unsplash", search, "agent")).toEqual({
      problem: { code: "invalid", message: "Parity has no connector called unsplash. It has fake.", field: "connector" }
    })
  })

  it("records how each search ended, without what it searched for", async () => {
    const { connector } = fakeConnector()
    const { hub: connectors, searches } = hub(connector)

    await connectors.search("fake", search, "window")
    await connectors.setKey("fake", "good")
    await connectors.search("fake", { ...search, filters: { platform: "ios" } }, "agent")

    expect(searches).toEqual([
      { connector: "fake", from: "window", kind: "screens", problem: "key-refused", ms: 5 },
      { connector: "fake", from: "agent", kind: "screens", filters: { platform: "ios" }, found: 1, ms: 5 }
    ])
  })

  it("finds a kind with the first connector that finds it and has a key, or asks the first for one", async () => {
    const photos = fakeConnector("key-refused", "photos", "photos")
    const first = fakeConnector("key-refused", "first")
    const second = fakeConnector("key-refused", "second")
    const { hub: connectors } = hub([photos.connector, first.connector, second.connector])

    expect(await connectors.find(search, "agent")).toHaveProperty("problem.code", "key-refused")
    expect([first.keys, second.keys]).toEqual([[undefined], []])

    await connectors.setKey("second", "good")

    expect(await connectors.find(search, "agent")).toHaveProperty("found.0.connector", "second")
    expect(await connectors.find({ query: "desk", kind: "sections" }, "agent")).toEqual({
      problem: { code: "invalid", message: "No connector in Parity finds sections.", field: "kind" }
    })
  })

  it("sends a search and a pick to the service for a connector with no key here, and uses a key here first", async () => {
    const { connector, keys, picked } = fakeConnector()
    const asked: string[] = []

    const service: SearchService = {
      connectors: ["fake"],
      async search(id) {
        asked.push(`search ${id}`)

        return { found: [] }
      },
      async picked(found) {
        asked.push(`picked ${found.id}`)
      }
    }

    const { hub: connectors } = hub(connector, memoryKeys(), {}, { service })

    const result: Found = {
      connector: "fake",
      id: "1",
      kind: "screens",
      title: "App",
      image: { url: "https://fake.example/1.png" },
      link: "https://fake.example/1",
      credit: []
    }

    expect((await connectors.states())[0]?.key).toBe("service")
    expect(await connectors.search("fake", search, "window")).toEqual({ found: [] })
    await connectors.picked(result)
    expect([asked, keys, picked]).toEqual([["search fake", "picked 1"], [], []])

    await connectors.setKey("fake", "good")
    await connectors.search("fake", search, "window")
    await connectors.picked(result)

    expect(asked).toEqual(["search fake", "picked 1"])
    expect(picked).toEqual([result])
  })
})
