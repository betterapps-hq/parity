import { z } from "zod"
import {
  type Access,
  type Connector,
  type Found,
  type FoundImage,
  type ProblemAnswer,
  type SearchAnswer,
  type SearchRequest
} from "./connector.ts"
import { notify, prepare, refusal, requestJson } from "./request.ts"

/*
 * Unsplash's API (unsplash.com/documentation), with an app's Access Key and its public scope only. Its terms ask three
 * things of an app (decisions.md, "Unsplash is the first stock source"): photos load from Unsplash's own links, each one
 * someone uses is reported to its download endpoint, which `picked` does, and every photo credits its photographer and
 * Unsplash, linked with Parity's referral. A new app gets 50 requests an hour until Unsplash approves it for production.
 */

const api = "https://api.unsplash.com"

/** How links to Unsplash name Parity, as its guidelines ask. */
const referral = "utm_source=parity&utm_medium=referral"

/** The width of the `regular` size, which results load at. */
const regularWidth = 1080

/** A photo in Unsplash's answer. Fields Parity doesn't read are left alone. */
const photo = z.object({
  id: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
  description: z.string().nullish(),
  alt_description: z.string().nullish(),
  urls: z.object({ regular: z.url() }),
  links: z.object({ html: z.url() }),
  user: z.object({ name: z.string(), links: z.object({ html: z.url() }) })
})

const answer = z.object({ results: z.array(photo) })

export const unsplash: Connector = {
  info: {
    id: "unsplash",
    name: "Unsplash",
    site: "https://unsplash.com",
    finds: ["photos"],
    depths: ["standard"],
    limit: { default: 20, max: 30 },
    more: "page",
    orientations: ["landscape", "portrait", "squarish"],
    colors: [
      "black_and_white",
      "black",
      "white",
      "yellow",
      "orange",
      "red",
      "purple",
      "magenta",
      "green",
      "teal",
      "blue"
    ],
    apiKey: {
      name: "Access Key",
      page: "https://unsplash.com/oauth/applications",
      variable: "PARITY_UNSPLASH_ACCESS_KEY"
    }
  },
  probe: { query: "desk", kind: "photos", limit: 1 },
  search: searchUnsplash,
  picked: tellUnsplash
}

async function searchUnsplash(request: SearchRequest, access: Access): Promise<SearchAnswer> {
  const prepared = prepare(unsplash.info, request, access)

  if ("problem" in prepared) {
    return prepared
  }

  const { query, limit, page, orientation, color } = prepared.request
  // High keeps out photos Unsplash marks as unsuitable for every audience, since designs are shown to others.
  const params = new URLSearchParams({ query, per_page: String(limit), content_filter: "high" })

  if (page !== undefined) {
    params.set("page", String(page))
  }

  if (orientation) {
    params.set("orientation", orientation)
  }

  if (color) {
    params.set("color", color)
  }

  const answered = await requestJson(access, {
    source: "Unsplash",
    url: `${api}/search/photos?${params}`,
    init: { headers: headers(prepared.key) },
    schema: answer,
    refused
  })

  return "problem" in answered ? answered : { found: answered.data.results.map(foundPhoto) }
}

/** Reports a photo someone used to Unsplash's download endpoint, as its terms ask. A failure is let go. */
async function tellUnsplash(found: Found, access: Access): Promise<void> {
  if (access.key) {
    await notify(access, `${api}/photos/${encodeURIComponent(found.id)}/download`, { headers: headers(access.key) })
  }
}

function headers(key: string): HeadersInit {
  return { authorization: `Client-ID ${key}`, "accept-version": "v1" }
}

function foundPhoto(each: z.infer<typeof photo>): Found {
  const image: FoundImage = {
    url: each.urls.regular,
    width: Math.min(regularWidth, each.width),
    height: Math.round((each.height / each.width) * Math.min(regularWidth, each.width))
  }

  return {
    connector: "unsplash",
    id: each.id,
    kind: "photos",
    title: each.alt_description || each.description || `Photo by ${each.user.name}`,
    image,
    link: withReferral(each.links.html),
    credit: [
      { name: each.user.name, url: withReferral(each.user.links.html) },
      { name: "Unsplash", url: `https://unsplash.com/?${referral}` }
    ]
  }
}

function withReferral(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${referral}`
}

/** What each of Unsplash's failures means for the person. It says a limit is reached with a 403, not a 429. */
function refused(response: Response, body: string): ProblemAnswer {
  if (response.status === 401) {
    return refusal(
      "key-refused",
      "Unsplash didn't accept this Access Key. Check it, or copy it again from your app on Unsplash."
    )
  }

  if (response.status === 429 || (response.status === 403 && limitReached(response, body))) {
    return refusal(
      "rate-limited",
      "Unsplash allows 50 searches an hour until the app is approved for production. Try again later."
    )
  }

  if (response.status === 403) {
    return refusal("no-access", "Unsplash turned this search down for this app's key.")
  }

  return refusal("unavailable", "Unsplash isn't answering right now. Try again in a moment.")
}

function limitReached(response: Response, body: string): boolean {
  return response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(body)
}
