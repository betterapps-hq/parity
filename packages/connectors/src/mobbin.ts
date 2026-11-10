import { z } from "zod"
import {
  type Access,
  type Connector,
  type Found,
  type FoundImage,
  type Problem,
  type ProblemAnswer,
  retryAfter,
  type SearchAnswer,
  type SearchRequest
} from "./connector.ts"
import { prepare, readJson, refusal, sendSearch } from "./request.ts"

/*
 * Mobbin's REST API (docs.mobbin.com/api), on its Team and Enterprise plans. It has one endpoint: screens searched in
 * plain words on iOS or the web, which is all this connector offers. Flows and sections are only in Mobbin's MCP server,
 * which signs each person in with their own account, so they wait for a connector that does that. The key is scoped to
 * a Mobbin workspace, which shares 60 requests a minute between everyone using it.
 */

const endpoint = "https://api.mobbin.com/v1/screens/search"

/** A screen in Mobbin's answer, as its OpenAPI spec describes it. Fields Parity doesn't read are left alone. */
const screen = z.object({
  id: z.string().min(1),
  image: z.object({
    url: z.url(),
    width: z.int().positive().optional(),
    height: z.int().positive().optional(),
    url_expires_at: z.iso.datetime({ offset: true })
  }),
  mobbin_url: z.url(),
  app_name: z.string(),
  platform: z.enum(["ios", "web"])
})

const answer = z.object({ screens: z.array(screen) })

const apiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

/** Mobbin's screen ids, which `exclude_screen_ids` takes and nothing else. */
const screenId = z.uuid()

/** What `POST /v1/screens/search` takes. */
interface MobbinSearch {
  query: string
  platform: string | undefined
  mode: string
  limit: number
  exclude_screen_ids?: string[]
}

export const mobbin: Connector = {
  info: {
    id: "mobbin",
    name: "Mobbin",
    site: "https://mobbin.com",
    // From Mobbin's own logo file for apps that connect to it (github.com/mobbin/skills).
    mark: {
      box: "18 29.5 44 21",
      path: "M44.7009 50.1296H33.2479V44.848L28.3096 50.1293L18 50.1246V39.3516L26.9614 29.8706H39.3491V34.9105L44.1747 29.8706H54.907V38.1601H62V50.1296H49.3749V45.1307L44.7009 50.1296Z"
    },
    // From the API reference's notes on `query`, and Mobbin's guidance for agents.
    guide: {
      examples: [
        "pricing page with a yearly toggle",
        "sign in page with Google",
        "dashboard with a usage chart",
        "billing settings"
      ],
      tips: [
        {
          lead: "Say the kind of screen, then what's on it",
          detail: "“paywall with plan cards and a free trial button”"
        },
        { lead: "Name an app to see only its screens", detail: "“Spotify now playing”" },
        { lead: "Search for one screen at a time", detail: "Words like “clean” or “modern” don't help." }
      ]
    },
    finds: ["screens"],
    filters: [
      {
        id: "platform",
        name: "Platform",
        values: [
          { id: "web", name: "Web", icon: "desktop" },
          { id: "ios", name: "iOS", icon: "phone" }
        ],
        default: "web"
      },
      {
        id: "depth",
        name: "Depth",
        values: [
          { id: "standard", name: "Standard" },
          { id: "deep", name: "Deep" }
        ],
        // Standard by default: deep search spends 5 of the person's AI credits each time it finds something.
        default: "standard"
      }
    ],
    limit: { default: 20, max: 100 },
    more: "exclude",
    // Made in Mobbin's team settings, under API keys.
    auth: { type: "key", variable: "PARITY_MOBBIN_API_KEY" }
  },
  search: searchMobbin
}

async function searchMobbin(request: SearchRequest, access: Access): Promise<SearchAnswer> {
  const prepared = prepare(mobbin.info, request, access)

  if ("problem" in prepared) {
    return prepared
  }

  const { query, limit, filters, exclude = [] } = prepared.request
  const excluded = exclude.filter((id) => screenId.safeParse(id).success)
  // Both have defaults, so checkRequest has filled them in.
  const body: MobbinSearch = { query, platform: filters.platform, mode: filters.depth ?? "standard", limit }

  if (excluded.length > 0) {
    body.exclude_screen_ids = excluded
  }

  return sendSearch(access, {
    source: "Mobbin",
    url: endpoint,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${prepared.key}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(body)
    },
    schema: answer,
    found: (data) => data.screens.map(foundScreen),
    refused
  })
}

function foundScreen(each: z.infer<typeof screen>): Found {
  const { url, width, height, url_expires_at } = each.image
  const image: FoundImage = { url, expiresAt: Date.parse(url_expires_at) }

  if (width !== undefined && height !== undefined) {
    image.width = width
    image.height = height
  }

  return {
    connector: "mobbin",
    id: each.id,
    kind: "screens",
    title: each.app_name,
    platform: each.platform,
    image,
    link: each.mobbin_url,
    credit: [{ name: each.app_name }, { name: "Mobbin", url: each.mobbin_url }]
  }
}

/** What each of Mobbin's failures means for the person or agent, from its status and, for a bad request, its own words. */
function refused(response: Response, body: string): ProblemAnswer {
  if (response.status === 401) {
    return refusal("key-refused", "Mobbin turned down this copy of Parity's key, so it can't search Mobbin right now.")
  }

  if (response.status === 403) {
    return refusal("no-access", "Parity's Mobbin plan doesn't include searching from other apps.")
  }

  if (response.status === 429) {
    const wait = retryAfter(response.headers.get("retry-after"), Date.now())
    const when = wait === undefined ? "in a minute" : `in ${wait} second${wait === 1 ? "" : "s"}`

    const limited: Problem = {
      code: "rate-limited",
      message: `Mobbin allows 60 searches a minute. Try again ${when}.`
    }

    if (wait !== undefined) {
      limited.retryAfter = wait
    }

    return { problem: limited }
  }

  if (response.status === 400) {
    const said = readJson(body, apiError)?.error.message

    return refusal("invalid", said ? `Mobbin couldn't run this search: ${said}` : "Mobbin couldn't run this search.")
  }

  return refusal("unavailable", "Mobbin isn't answering right now. Try again in a moment.")
}
