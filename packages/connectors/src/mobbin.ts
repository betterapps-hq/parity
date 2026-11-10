import { z } from "zod"
import {
  type Access,
  checkRequest,
  type Connector,
  type Found,
  type FoundImage,
  type Problem,
  type ProblemAnswer,
  retryAfter,
  type SearchAnswer,
  type SearchRequest
} from "./connector.ts"

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
    finds: ["screens"],
    platforms: ["web", "ios"],
    // Standard first: deep search spends 5 of the person's AI credits each time it finds something.
    depths: ["standard", "deep"],
    limit: { default: 20, max: 100 },
    keyPage: "https://mobbin.com/settings/team/api-keys"
  },
  probe: { query: "login screen", kind: "screens", platform: "web", limit: 1, depth: "standard" },
  search: searchMobbin
}

async function searchMobbin(request: SearchRequest, access: Access): Promise<SearchAnswer> {
  const checked = checkRequest(mobbin.info, request)

  if ("problem" in checked) {
    return checked
  }

  if (!access.key) {
    return problem("no-key", "Add a Mobbin API key to search Mobbin.")
  }

  const { query, platform, limit, depth, exclude = [] } = checked.request
  const excluded = exclude.filter((id) => screenId.safeParse(id).success)

  const body: MobbinSearch = { query, platform, mode: depth, limit }

  if (excluded.length > 0) {
    body.exclude_screen_ids = excluded
  }

  const init: RequestInit = {
    method: "POST",
    headers: { authorization: `Bearer ${access.key}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  }

  if (access.signal) {
    init.signal = access.signal
  }

  let response: Response

  try {
    response = await access.fetch(endpoint, init)
  } catch (error) {
    const stopped = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")

    return problem(
      "unavailable",
      stopped
        ? "Mobbin took too long to answer. Try again."
        : "Couldn't reach Mobbin. Check your connection and try again."
    )
  }

  if (!response.ok) {
    return refused(response, await response.text().catch(() => ""))
  }

  const parsed = answer.safeParse(await response.json().catch(() => undefined))

  if (!parsed.success) {
    return problem("unavailable", "Mobbin answered with something Parity couldn't read. Try again.")
  }

  return { found: parsed.data.screens.map(foundScreen) }
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

/** What each of Mobbin's failures means for the person, from its status and, for a bad request, its own words. */
function refused(response: Response, body: string): SearchAnswer {
  if (response.status === 401) {
    return problem(
      "key-refused",
      "Mobbin didn't accept this API key. Check it, or create another in Mobbin's settings."
    )
  }

  if (response.status === 403) {
    return problem("no-access", "Searching from other apps needs a Mobbin Team or Enterprise plan.")
  }

  if (response.status === 429) {
    const wait = retryAfter(response.headers.get("retry-after"), Date.now())
    const when = wait === undefined ? "in a minute" : `in ${wait} second${wait === 1 ? "" : "s"}`

    const limited: Problem = {
      code: "rate-limited",
      message: `Mobbin allows 60 searches a minute for your workspace. Try again ${when}.`
    }

    if (wait !== undefined) {
      limited.retryAfter = wait
    }

    return { problem: limited }
  }

  if (response.status === 400) {
    const said = parseJson(body, apiError)?.error.message

    return problem("invalid", said ? `Mobbin couldn't run this search: ${said}` : "Mobbin couldn't run this search.")
  }

  return problem("unavailable", "Mobbin isn't answering right now. Try again in a moment.")
}

function problem(code: Problem["code"], message: string): ProblemAnswer {
  return { problem: { code, message } }
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T | undefined {
  try {
    return schema.safeParse(JSON.parse(text)).data
  } catch {
    return undefined
  }
}
