import type { Connector, Found, SearchAnswer, SearchRequest } from "@parity-app/connectors"
import { describe, expect, it } from "vite-plus/test"
import {
  answerSearch,
  cacheKey,
  keptFor,
  type Limiter,
  listConnectors,
  type SearchCache,
  type SearchServiceOptions
} from "./search.ts"

function result(id = "1"): Found {
  return {
    connector: "fake",
    id,
    kind: "photos",
    title: "A beach",
    image: { url: "https://fake.example/1.jpg" },
    link: "https://fake.example/1",
    credit: [{ name: "Ada" }]
  }
}

/** A connector that answers as `answers` says, and keeps what it was sent. */
function fakeConnector(
  id = "fake",
  answer: () => SearchAnswer | Promise<SearchAnswer> = () => ({ found: [result()] })
) {
  const sent: { request: SearchRequest; key: string | undefined }[] = []

  const connector: Connector = {
    info: {
      id,
      name: "Fake",
      site: "https://fake.example",
      mark: { box: "0 0 1 1", path: "M0 0h1v1H0z" },
      guide: { examples: ["beach"], tips: [] },
      finds: ["photos"],
      filters: [
        {
          id: "color",
          name: "Color",
          values: [
            { id: "any", name: "Any" },
            { id: "red", name: "Red" }
          ],
          default: "any"
        }
      ],
      limit: { default: 10, max: 10 },
      rateLimit: { requests: 100, per: "minute" },
      more: "page",
      auth: { type: "key", variable: `PARITY_${id.toUpperCase()}_KEY` }
    },
    async search(request, access) {
      sent.push({ request, key: access.key })

      return answer()
    }
  }

  return { connector, sent }
}

/** A cache in memory, which keeps how long each answer was to be kept. */
function memoryCache() {
  const values = new Map<string, string>()
  const kept: number[] = []

  const cache: SearchCache = {
    async get(key) {
      return values.get(key) ?? null
    },
    async put(key, value, seconds) {
      values.set(key, value)
      kept.push(seconds)
    }
  }

  return { cache, values, kept }
}

/** A limiter that allows `allowed` uses of each key, and keeps the keys it was asked about. */
function limiter(allowed = Infinity) {
  const taken = new Map<string, number>()

  const limit: Limiter = {
    async take(key) {
      const uses = (taken.get(key) ?? 0) + 1
      taken.set(key, uses)

      return uses <= allowed
    }
  }

  return { limit, taken }
}

function service(over: Partial<SearchServiceOptions> = {}) {
  const fake = fakeConnector()
  const store = memoryCache()
  const reported: { connector: string; code: string }[] = []

  const options: SearchServiceOptions = {
    connectors: [fake.connector],
    keys: { fake: "secret" },
    fetch: async () => new Response(null),
    cache: store.cache,
    people: limiter().limit,
    addresses: limiter().limit,
    sources: limiter().limit,
    timeout: 1000,
    report: (trouble) => reported.push(trouble),
    ...over
  }

  return { options, fake, store, reported }
}

const beach = { query: "beach", kind: "photos" }
const ada = { person: "user_ada", address: "203.0.113.7" }

describe("listConnectors", () => {
  it("lists only the connectors the service has a key for", () => {
    const other = fakeConnector("other")
    const { options } = service()

    expect(listConnectors({ ...options, connectors: [...options.connectors, other.connector] })).toEqual({
      status: 200,
      body: { connectors: ["fake"] }
    })
  })
})

describe("answerSearch", () => {
  it("runs a signed-in person's search with the service's key and gives what it found", async () => {
    const { options, fake } = service()

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply).toEqual({ status: 200, body: { found: [result()] } })
    expect(fake.sent).toEqual([{ request: { ...beach, limit: 10, filters: { color: "any" } }, key: "secret" }])
  })

  it("keeps an answer for a day and gives the next person the kept one without asking the source", async () => {
    const { options, fake, store } = service()

    await answerSearch(options, { connector: "fake", body: beach, caller: ada })
    const again = await answerSearch(options, { connector: "fake", body: beach, caller: { person: "user_grace" } })

    expect(again).toEqual({ status: 200, body: { found: [result()] } })
    expect(fake.sent).toHaveLength(1)
    expect(store.kept).toEqual([keptFor])
  })

  it("keeps nothing that says what was searched or who asked", async () => {
    const { options, store } = service()

    await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    const [key] = [...store.values.keys()]

    expect(key).toMatch(/^search:[0-9a-f]{64}$/)
    expect(JSON.stringify([...store.values])).not.toContain("user_ada")
    expect(key).not.toContain("beach")
  })

  it("leaves out how many searches the key has left", async () => {
    const fake = fakeConnector("fake", () => ({ found: [result()], allowance: { remaining: 3, limit: 100 } }))
    const { options } = service({ connectors: [fake.connector] })

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply.body).toEqual({ found: [result()] })
  })

  it("answers signed-out with 401 for a request that names nobody, and never searches", async () => {
    const { options, fake } = service()

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: { address: "203.0.113.7" } })

    expect(reply.status).toBe(401)
    expect(reply.body).toMatchObject({ problem: { code: "signed-out" } })
    expect(fake.sent).toEqual([])
  })

  it("limits requests that name nobody by their address", async () => {
    const addresses = limiter(1)
    const { options } = service({ addresses: addresses.limit })
    const nobody = { connector: "fake", body: beach, caller: { address: "203.0.113.7" } }

    await answerSearch(options, nobody)
    const reply = await answerSearch(options, nobody)

    expect(reply).toMatchObject({ status: 429, retryAfter: 60, body: { problem: { code: "rate-limited" } } })
    expect([...addresses.taken.keys()]).toEqual(["203.0.113.7"])
  })

  it("limits each person by their user id, before anything else is done for them", async () => {
    const people = limiter(1)
    const { options, fake } = service({ people: people.limit })

    await answerSearch(options, { connector: "fake", body: beach, caller: ada })
    const reply = await answerSearch(options, { connector: "fake", body: { ...beach, query: "sea" }, caller: ada })

    expect(reply).toMatchObject({ status: 429, retryAfter: 60, body: { problem: { code: "rate-limited" } } })
    expect([...people.taken.keys()]).toEqual(["user_ada"])
    expect(fake.sent).toHaveLength(1)
  })

  it("holds a source to its limit, but still gives a kept answer", async () => {
    const { options, fake } = service({ sources: limiter(1).limit })

    await answerSearch(options, { connector: "fake", body: beach, caller: ada })
    const fresh = await answerSearch(options, { connector: "fake", body: { ...beach, query: "sea" }, caller: ada })
    const kept = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(fresh).toMatchObject({ status: 429, body: { problem: { code: "rate-limited" } } })
    expect(kept.status).toBe(200)
    expect(fake.sent).toHaveLength(1)
  })

  it("says it doesn't search a connector it has no key for, or doesn't have", async () => {
    const { options } = service({ keys: {} })

    const keyless = await answerSearch(options, { connector: "fake", body: beach, caller: ada })
    const missing = await answerSearch(options, { connector: "nope", body: beach, caller: ada })

    expect(keyless).toMatchObject({ status: 404, body: { problem: { code: "no-key" } } })
    expect(missing).toMatchObject({ status: 404, body: { problem: { code: "no-key" } } })
  })

  it("refuses a body that isn't a search, naming the field", async () => {
    const { options } = service()

    const reply = await answerSearch(options, { connector: "fake", body: { query: "", kind: "photos" }, caller: ada })

    expect(reply).toMatchObject({ status: 400, body: { problem: { code: "invalid", field: "query" } } })
  })

  it("refuses a filter the connector doesn't take", async () => {
    const { options, fake } = service()

    const reply = await answerSearch(options, {
      connector: "fake",
      body: { ...beach, filters: { color: "plaid" } },
      caller: ada
    })

    expect(reply).toMatchObject({ status: 400, body: { problem: { code: "invalid" } } })
    expect(fake.sent).toEqual([])
  })

  it("passes on a problem the source gave, and doesn't keep it", async () => {
    const fake = fakeConnector("fake", () => ({
      problem: { code: "rate-limited", message: "Fake is busy.", retryAfter: 30 }
    }))

    const { options, store } = service({ connectors: [fake.connector] })

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply).toEqual({
      status: 200,
      body: { problem: { code: "rate-limited", message: "Fake is busy.", retryAfter: 30 } }
    })
    expect(store.values.size).toBe(0)
  })

  it("tells the owner of a refused key, and the app only that the source is unavailable", async () => {
    const fake = fakeConnector("fake", () => ({
      problem: { code: "key-refused", message: "Fake turned the key down." }
    }))

    const { options, reported } = service({ connectors: [fake.connector] })

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply).toMatchObject({ status: 503, body: { problem: { code: "unavailable" } } })
    expect(reported).toEqual([{ connector: "fake", code: "key-refused" }])
  })

  it("answers unavailable when the adapter throws", async () => {
    const fake = fakeConnector("fake", () => {
      throw new Error("boom")
    })

    const { options } = service({ connectors: [fake.connector] })

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply).toMatchObject({ status: 503, body: { problem: { code: "unavailable" } } })
  })

  it("searches again when what's kept can't be read", async () => {
    const { options, fake, store } = service()
    const key = await cacheKey("fake", { ...beach, kind: "photos", limit: 10, filters: { color: "any" } })
    store.values.set(key, "not json")

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply.status).toBe(200)
    expect(fake.sent).toHaveLength(1)
  })

  it("still answers when the answer can't be kept", async () => {
    const { options } = service({
      cache: {
        get: async () => null,
        put: async () => {
          throw new Error("full")
        }
      }
    })

    const reply = await answerSearch(options, { connector: "fake", body: beach, caller: ada })

    expect(reply).toEqual({ status: 200, body: { found: [result()] } })
  })
})

describe("cacheKey", () => {
  const checked = { query: "beach", kind: "photos" as const, limit: 10, filters: { color: "any", type: "photo" } }

  it("is the same whatever order the filters and excluded results come in", async () => {
    const one = await cacheKey("fake", { ...checked, exclude: ["a", "b"] })

    const other = await cacheKey("fake", {
      ...checked,
      filters: { type: "photo", color: "any" },
      exclude: ["b", "a"]
    })

    expect(one).toBe(other)
  })

  it("differs by connector, query, filter, page and what's excluded", async () => {
    const keys = await Promise.all([
      cacheKey("fake", checked),
      cacheKey("other", checked),
      cacheKey("fake", { ...checked, query: "sea" }),
      cacheKey("fake", { ...checked, filters: { color: "red", type: "photo" } }),
      cacheKey("fake", { ...checked, page: 2 }),
      cacheKey("fake", { ...checked, exclude: ["a"] })
    ])

    expect(new Set(keys).size).toBe(keys.length)
  })
})
