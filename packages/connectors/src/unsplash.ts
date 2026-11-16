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
import { notify, prepare, refusal, sendSearch } from "./request.ts"

/*
 * Unsplash's API (unsplash.com/documentation), with an app's Access Key and its public scope only. Its terms ask three
 * things of an app: photos load from Unsplash's own links, each one
 * someone uses is reported to its download endpoint, which `placed` does, and every photo credits its photographer and
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
  urls: z.object({ regular: z.url(), small: z.url() }),
  links: z.object({ html: z.url() }),
  user: z.object({ name: z.string(), links: z.object({ html: z.url() }) })
})

const answer = z.object({ results: z.array(photo) })

export const unsplash: Connector = {
  info: {
    id: "unsplash",
    name: "Unsplash",
    site: "https://unsplash.com",
    mark: { box: "0 0 24 24", path: "M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z" },
    guide: {
      examples: [
        "mountain lake at sunrise",
        "desk with a laptop and coffee",
        "city skyline at dusk",
        "portrait in window light"
      ],
      tips: [
        { lead: "Say what's in the photo", detail: "A few words do it: “mountain lake at sunrise”." },
        { lead: "Narrow by orientation or color", detail: "They filter the results without changing your words." }
      ]
    },
    finds: ["photos"],
    filters: [
      {
        id: "orientation",
        name: "Orientation",
        values: [
          { id: "landscape", name: "Landscape", icon: "landscape" },
          { id: "portrait", name: "Portrait", icon: "portrait" },
          { id: "squarish", name: "Square", icon: "square" }
        ]
      },
      {
        id: "color",
        name: "Color",
        values: [
          {
            id: "black_and_white",
            name: "Black and white",
            swatch: "linear-gradient(135deg, black 50%, white 50%)"
          },
          { id: "black", name: "Black", swatch: "black" },
          { id: "white", name: "White", swatch: "white" },
          { id: "yellow", name: "Yellow", swatch: "oklch(0.86 0.17 95)" },
          { id: "orange", name: "Orange", swatch: "oklch(0.72 0.18 55)" },
          { id: "red", name: "Red", swatch: "oklch(0.6 0.22 25)" },
          { id: "purple", name: "Purple", swatch: "oklch(0.52 0.2 300)" },
          { id: "magenta", name: "Magenta", swatch: "oklch(0.62 0.25 345)" },
          { id: "green", name: "Green", swatch: "oklch(0.62 0.17 145)" },
          { id: "teal", name: "Teal", swatch: "oklch(0.65 0.11 195)" },
          { id: "blue", name: "Blue", swatch: "oklch(0.56 0.18 255)" }
        ]
      }
    ],
    limit: { default: 20, max: 30 },
    // Until Unsplash approves the app for production, which raises it to 5,000 an hour.
    rateLimit: { requests: 50, per: "hour" },
    more: "page",
    // The Access Key of Parity's app on Unsplash.
    auth: { type: "key", variable: "PARITY_UNSPLASH_ACCESS_KEY" }
  },
  search: searchUnsplash,
  placed: tellUnsplash
}

async function searchUnsplash(request: SearchRequest, access: Access): Promise<SearchAnswer> {
  const prepared = prepare(unsplash.info, request, access)

  if ("problem" in prepared) {
    return prepared
  }

  const { query, limit, page, filters } = prepared.request
  // High keeps out photos Unsplash marks as unsuitable for every audience, since designs are shown to others.
  const params = new URLSearchParams({ query, per_page: String(limit), content_filter: "high" })

  if (page !== undefined) {
    params.set("page", String(page))
  }

  // checkRequest has kept them to the values above, which are Unsplash's own.
  for (const [id, value] of Object.entries(filters)) {
    params.set(id, value)
  }

  return sendSearch(access, {
    source: "Unsplash",
    url: `${api}/search/photos?${params}`,
    init: { headers: headers(prepared.key) },
    schema: answer,
    found: (data) => data.results.map(foundPhoto),
    refused
  })
}

/** Reports a photo placed in a design to Unsplash's download endpoint, as its terms ask, and says whether it took it. */
async function tellUnsplash(found: Found, access: Access): Promise<boolean> {
  if (!access.key) {
    return false
  }

  return notify(access, `${api}/photos/${encodeURIComponent(found.id)}/download`, { headers: headers(access.key) })
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
    // Unsplash's small size is 400 pixels wide.
    preview: { url: each.urls.small },
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
      "Unsplash turned down this copy of Parity's key, so it can't search Unsplash right now."
    )
  }

  if (response.status === 429 || (response.status === 403 && limitReached(response, body))) {
    return refusal(
      "rate-limited",
      "Unsplash allows 50 searches an hour until the app is approved for production. Try again later."
    )
  }

  if (response.status === 403) {
    return refusal("no-access", "Unsplash turned this search down for Parity's key.")
  }

  return refusal("unavailable", "Unsplash isn't answering right now. Try again in a moment.")
}

function limitReached(response: Response, body: string): boolean {
  return response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(body)
}
