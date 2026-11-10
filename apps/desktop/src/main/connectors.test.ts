import type { Connector, Fetch, FindKind, Found, RecentSearch, SearchRequest } from "@parity-app/connectors"
import { describe, expect, it } from "vite-plus/test"
import {
  type ConnectorHubOptions,
  createConnectorHub,
  type PlacedEvent,
  type SearchService,
  type Searched
} from "./connectors.ts"
import { type Placement, type PlacementLog } from "./placements.ts"
import type { SearchHistory } from "./search-history.ts"

function result(connector: string, id = "1"): Found {
  return {
    connector,
    id,
    kind: "screens",
    title: "App",
    image: { url: "https://fake.example/1.png" },
    link: "https://fake.example/1",
    credit: [{ name: "App" }]
  }
}

/** A connector that finds one screen with the key "good", and answers other keys as `refuse` says. */
function fakeConnector(id = "fake", finds: FindKind = "screens", filter?: string) {
  const keys: (string | undefined)[] = []
  const sent: SearchRequest[] = []
  const picked: Found[] = []

  const connector: Connector = {
    info: {
      id,
      name: "Fake",
      site: "https://fake.example",
      mark: { box: "0 0 1 1", path: "M0 0h1v1H0z" },
      guide: { examples: ["login screen"], tips: [] },
      finds: [finds],
      filters: filter ? [{ id: filter, name: filter, values: [{ id: "a", name: "A" }], default: "a" }] : [],
      limit: { default: 10, max: 10 },
      more: "exclude",
      auth: { type: "key", variable: `PARITY_${id.toUpperCase()}_KEY` }
    },
    async placed(found) {
      picked.push(found)
    },
    async search(request, access) {
      keys.push(access.key)
      sent.push(request)

      return access.key === "good"
        ? { found: [result(id)] }
        : { problem: { code: "no-key", message: "This copy of Parity has no Fake key." } }
    }
  }

  return { connector, keys, sent, picked }
}

function memoryHistory(): SearchHistory & { kept: RecentSearch[] } {
  const kept: RecentSearch[] = []

  return {
    kept,
    list: async () => kept,
    async add(search) {
      kept.unshift(search)

      return kept
    }
  }
}

const fetch: Fetch = () => Promise.reject(new Error("no network in tests"))

function memoryPlacements(): PlacementLog & { kept: Placement[] } {
  const kept: Placement[] = []

  return {
    kept,
    async add(placed) {
      if (kept.some((each) => each.design === placed.design && each.id === placed.id)) {
        return false
      }

      kept.push(placed)

      return true
    }
  }
}

function hub(
  connector: Connector | Connector[],
  keys: Record<string, string> = {},
  more: Partial<ConnectorHubOptions> = {}
) {
  const secrets: string[][] = []
  const searches: Searched[] = []
  const placedEvents: PlacedEvent[] = []
  const history = memoryHistory()
  const placements = memoryPlacements()
  let clock = 0

  const made = createConnectorHub({
    connectors: Array.isArray(connector) ? connector : [connector],
    keys,
    history,
    placements,
    fetch,
    timeout: 1000,
    budget: 30,
    secrets: (values) => secrets.push(values),
    searched: (search) => searches.push(search),
    placed: (placed) => placedEvents.push(placed),
    now: () => (clock += 5),
    date: () => 1000,
    ...more
  })

  return { hub: made, secrets, searches, history, placements, placedEvents }
}

const search: SearchRequest = { query: "login", kind: "screens" }

describe("createConnectorHub", () => {
  it("says which connectors this copy can search, and searches with the owner's key", async () => {
    const { connector, keys } = fakeConnector()
    const other = fakeConnector("other")
    const { hub: connectors, secrets } = hub([connector, other.connector], { fake: "good" })

    connectors.start()

    expect(connectors.states().map(({ id, key }) => [id, key])).toEqual([
      ["fake", "here"],
      ["other", "none"]
    ])
    expect(secrets).toEqual([["good"]])
    expect(await connectors.search("fake", search, "window")).toHaveProperty("found")
    expect(keys).toEqual(["good"])
  })

  it("checks a search before sending it, and sends it with the connector's defaults", async () => {
    const { connector, sent } = fakeConnector("fake", "screens", "platform")
    const { hub: connectors, searches } = hub(connector, { fake: "good" })

    expect(await connectors.search("fake", { ...search, filters: { color: "red" } }, "agent")).toHaveProperty(
      "problem.field",
      "filters.color"
    )
    await connectors.search("fake", search, "agent")

    expect(sent).toEqual([{ ...search, limit: 10, filters: { platform: "a" } }])
    expect(searches.map(({ filters, problem }) => ({ filters, problem }))).toEqual([
      { filters: undefined, problem: "invalid" },
      { filters: { platform: "a" }, problem: undefined }
    ])
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

    expect(searches).toEqual([{ connector: "fake", from: "window", kind: "screens", problem: "no-key", ms: 10 }])
  })

  it("keeps the person's searches that worked, with every filter they ran with, and never an agent's", async () => {
    const { connector } = fakeConnector("fake", "screens", "platform")
    const { hub: connectors, history } = hub(connector, { fake: "good" })

    await connectors.search("fake", search, "window")
    await connectors.search("fake", { ...search, query: "agent's" }, "agent")
    await connectors.search("fake", { ...search, filters: { color: "red" } }, "window")

    expect(await connectors.recent()).toEqual([
      { connector: "fake", kind: "screens", query: "login", filters: { platform: "a" }, at: 1000 }
    ])
    expect(history.kept).toHaveLength(1)
  })

  it("still answers a search whose recent search can't be kept", async () => {
    const { connector } = fakeConnector()
    const history: SearchHistory = { list: async () => [], add: () => Promise.reject(new Error("disk full")) }
    const { hub: connectors } = hub(connector, { fake: "good" }, { history })

    expect(await connectors.search("fake", search, "window")).toHaveProperty("found")
  })

  it("runs each connector's budget of searches a minute, then says how long to wait", async () => {
    const { connector, sent } = fakeConnector()
    const { hub: connectors } = hub(connector, { fake: "good" }, { budget: 2 })

    await connectors.search("fake", search, "agent")
    await connectors.search("fake", search, "agent")

    expect(await connectors.search("fake", search, "agent")).toEqual({
      problem: {
        code: "rate-limited",
        message: "Parity runs up to 2 Fake searches a minute. Try again in 60 seconds.",
        retryAfter: 60
      }
    })
    expect(sent).toHaveLength(2)
  })

  it("finds a kind with a connector that takes the filters named and has a key", async () => {
    const photos = fakeConnector("photos", "photos")
    const first = fakeConnector("first")
    const second = fakeConnector("second")
    const platforms = fakeConnector("platforms", "screens", "platform")
    const all = [photos.connector, first.connector, second.connector, platforms.connector]

    const { hub: none } = hub(all)
    expect(await none.find(search, "agent")).toHaveProperty("problem.code", "no-key")
    expect(first.keys).toEqual([undefined])

    const { hub: keyed } = hub(all, { second: "good", platforms: "good" })
    expect(await keyed.find(search, "agent")).toHaveProperty("found.0.connector", "second")
    expect(await keyed.find({ ...search, filters: { platform: "a" } }, "agent")).toHaveProperty(
      "found.0.connector",
      "platforms"
    )
    expect(await keyed.find(search, "agent", "first")).toHaveProperty("problem.code", "no-key")
    expect(await keyed.find({ query: "desk", kind: "sections" }, "agent")).toEqual({
      problem: { code: "invalid", message: "No connector in Parity finds sections.", field: "kind" }
    })
  })

  it("records a result placed in a design once, counts it, then tells the source, from its own copy", async () => {
    const { connector, picked } = fakeConnector()
    const { hub: connectors, placements, placedEvents } = hub(connector, { fake: "good" })
    const home = { design: "D:/shop::home", from: "agent" as const }

    await connectors.placed(result("fake", "never-found"), home)
    await connectors.search("fake", search, "window")
    await connectors.placed({ ...result("fake"), title: "Changed by the window" }, home)
    await connectors.placed(result("fake"), home)
    await connectors.placed(result("fake"), { design: "D:/shop::pricing", from: "window" })

    expect(connectors.result("fake", "1")).toEqual(result("fake"))
    expect(connectors.result("fake", "never-found")).toBeUndefined()
    expect(picked).toEqual([result("fake"), result("fake")])
    expect(placements.kept.map(({ design, from }) => [design, from])).toEqual([
      ["D:/shop::home", "agent"],
      ["D:/shop::pricing", "window"]
    ])
    expect(placedEvents).toEqual([
      { connector: "fake", kind: "screens", from: "agent" },
      { connector: "fake", kind: "screens", from: "window" }
    ])
  })

  it("still tells the source when a placement can't be counted", async () => {
    const { connector, picked } = fakeConnector()
    const placements: PlacementLog = { add: () => Promise.reject(new Error("disk full")) }
    const { hub: connectors } = hub(connector, { fake: "good" }, { placements })

    await connectors.search("fake", search, "agent")
    await connectors.placed(result("fake"), { design: "D:/shop::home", from: "agent" })

    expect(picked).toEqual([result("fake")])
  })

  it("sends a search and a placement to the service for a connector with no key here", async () => {
    const { connector, keys, picked } = fakeConnector()
    const asked: string[] = []

    const service: SearchService = {
      connectors: ["fake"],
      async search(id) {
        asked.push(`search ${id}`)

        return { found: [result(id)] }
      },
      async placed(found) {
        asked.push(`placed ${found.id}`)
      }
    }

    const { hub: connectors } = hub(connector, {}, { service })

    expect(connectors.states()[0]?.key).toBe("service")
    await connectors.search("fake", search, "window")
    await connectors.placed(result("fake"), { design: "D:/shop::home", from: "window" })

    expect([asked, keys, picked]).toEqual([["search fake", "placed 1"], [], []])
  })
})
