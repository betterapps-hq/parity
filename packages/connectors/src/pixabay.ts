import { z } from "zod"
import {
  type Access,
  type Connector,
  type FilterScope,
  type FilterValue,
  type Found,
  type ProblemAnswer,
  retryAfter,
  type SearchAnswer,
  type SearchRequest
} from "./connector.ts"
import { prepare, refusal, sendSearch } from "./request.ts"

/*
 * Pixabay's image and video searches (pixabay.com/api/docs), with the app owner's key. Its terms ask three things of an
 * app: show where results are from whenever they're shown, which each result's credit does; use its image links only
 * to show search results, so a picture placed in a design is saved into the project rather than linked (its videos may
 * be played from its own links); and keep each search's answer for 24 hours rather than ask again. It allows 100
 * requests a minute for a key, and a search reaches its first 500 results only.
 */

const api = { images: "https://pixabay.com/api/", videos: "https://pixabay.com/api/videos/" }

/** The longest search Pixabay takes, shorter than Mobbin's. */
const queryLimit = 100

/** The fewest results Pixabay returns a page. A smaller limit asks for this many and keeps the first few. */
const fewestPerPage = 3

/** How far into a search's results Pixabay goes. A page past it would be an error, so it's empty instead. */
const reachable = 500

/** The longest side of `largeImageURL`, which results load at. */
const largeSide = 1280

/** How long Pixabay's image links work for. */
const linkLife = 24 * 60 * 60 * 1000

/**
 * What every result in Pixabay's answer has. Fields Parity doesn't read are left alone, as Pixabay adds new ones. Its
 * description isn't in its documentation yet, so a result without one is named by its tags.
 */
const result = z.object({
  id: z.int().positive(),
  pageURL: z.url(),
  tags: z.string(),
  description: z.string().nullish(),
  user_id: z.int(),
  user: z.string().min(1)
})

type Result = z.infer<typeof result>

/** An image in Pixabay's answer. */
const hit = result.extend({
  webformatURL: z.url(),
  webformatWidth: z.int().positive(),
  webformatHeight: z.int().positive(),
  largeImageURL: z.url(),
  imageWidth: z.int().positive(),
  imageHeight: z.int().positive()
})

const answer = z.object({ hits: z.array(hit) })

/** One size of a video. */
const rendition = z.object({ url: z.url(), width: z.int().positive(), height: z.int().positive() })

/** A video in Pixabay's answer: its medium size plays in the larger view, its tiny one in a list of results. */
const clip = result.extend({
  duration: z.number().nonnegative(),
  videos: z.object({ medium: rendition.extend({ thumbnail: z.url() }), tiny: rendition })
})

const clips = z.object({ hits: z.array(clip) })

/** The types orientation and color apply to: everything but videos. */
const pictures: FilterScope = { filter: "type", is: ["photos", "illustrations", "vectors"] }

/** Each of Pixabay's categories, by the id it takes, in the order the window lists them. */
const categories = [
  "animals",
  "backgrounds",
  "buildings",
  "business",
  "computer",
  "education",
  "fashion",
  "feelings",
  "food",
  "health",
  "industry",
  "music",
  "nature",
  "people",
  "places",
  "religion",
  "science",
  "sports",
  "transportation",
  "travel"
] as const

export const pixabay: Connector = {
  info: {
    id: "pixabay",
    name: "Pixabay",
    site: "https://pixabay.com",
    mark: {
      box: "0 0 24 24",
      path: "M5.627 10.234a.888.888 0 01-.887-.888H1.7c0 .49-.398.888-.888.888H0v9.447h15.56v-9.447H5.64zm-.886 2.796h-3.04v-1.323h3.04v1.323zm5.344 5.234a3.271 3.271 0 01-3.267-3.269c0-1.802 1.466-3.193 3.267-3.193s3.267 1.39 3.267 3.193a3.271 3.271 0 01-3.267 3.269zm1.756-3.269c0 .969-.788 1.757-1.756 1.757a1.759 1.759 0 01-1.756-1.757c0-.969.788-1.757 1.756-1.757s1.756.788 1.756 1.757zM24 9.501l-3.93 10.156-3.164-1.226V16.7l2.242.869 2.765-7.146L11.55 6.407l-.96 2.482h-1.73l1.769-4.57L24 9.501Z"
    },
    guide: {
      examples: ["mountain lake at sunrise", "desk with a laptop", "city skyline at night", "hand-drawn leaves"],
      tips: [
        { lead: "Name what's in it", detail: "Pixabay matches the words on each image: “yellow flowers”." },
        { lead: "Keep it short", detail: "Up to 100 letters. Fewer words find more." },
        { lead: "Choose a type", detail: "Photos, illustrations and vectors are searched apart." }
      ]
    },
    finds: ["photos", "videos"],
    filters: [
      {
        id: "type",
        name: "Type",
        default: "photos",
        values: [
          { id: "photos", name: "Photos" },
          { id: "illustrations", name: "Illustrations" },
          { id: "vectors", name: "Vectors" },
          { id: "videos", name: "Videos" }
        ]
      },
      {
        id: "orientation",
        name: "Orientation",
        when: pictures,
        values: [
          { id: "horizontal", name: "Landscape", icon: "landscape" },
          { id: "vertical", name: "Portrait", icon: "portrait" }
        ]
      },
      {
        id: "color",
        name: "Color",
        when: pictures,
        values: [
          { id: "grayscale", name: "Grayscale", swatch: "linear-gradient(135deg, black, white)" },
          {
            id: "transparent",
            name: "Transparent",
            swatch: "repeating-conic-gradient(#d4d4d4 0 25%, white 0 50%) 50% / 6px 6px"
          },
          { id: "red", name: "Red", swatch: "oklch(0.6 0.22 25)" },
          { id: "orange", name: "Orange", swatch: "oklch(0.72 0.18 55)" },
          { id: "yellow", name: "Yellow", swatch: "oklch(0.86 0.17 95)" },
          { id: "green", name: "Green", swatch: "oklch(0.62 0.17 145)" },
          { id: "turquoise", name: "Turquoise", swatch: "oklch(0.72 0.12 190)" },
          { id: "blue", name: "Blue", swatch: "oklch(0.56 0.18 255)" },
          { id: "lilac", name: "Lilac", swatch: "oklch(0.7 0.12 305)" },
          { id: "pink", name: "Pink", swatch: "oklch(0.75 0.14 350)" },
          { id: "white", name: "White", swatch: "white" },
          { id: "gray", name: "Gray", swatch: "oklch(0.6 0 0)" },
          { id: "black", name: "Black", swatch: "black" },
          { id: "brown", name: "Brown", swatch: "oklch(0.48 0.09 55)" }
        ]
      },
      {
        id: "footage",
        name: "Footage",
        when: { filter: "type", is: ["videos"] },
        values: [
          { id: "film", name: "Film" },
          { id: "animation", name: "Animation" }
        ]
      },
      {
        id: "category",
        name: "Category",
        values: [categoryValue(categories[0]), ...categories.slice(1).map((each) => categoryValue(each))]
      },
      // One value: picked by Pixabay's editors, or anything.
      { id: "editors", name: "Editor's choice", values: [{ id: "true", name: "Editor's choice" }] },
      {
        id: "order",
        name: "Order",
        default: "popular",
        values: [
          { id: "popular", name: "Popular" },
          { id: "latest", name: "Latest" }
        ]
      }
    ],
    limit: { default: 20, max: 200 },
    rateLimit: { requests: 100, per: "minute" },
    more: "page",
    // The key of Parity's account on Pixabay.
    auth: { type: "key", variable: "PARITY_PIXABAY_API_KEY" }
  },
  search: searchPixabay
}

function categoryValue(id: string): FilterValue {
  return { id, name: capitalized(id) }
}

/** The parameter Pixabay names each filter by, where it isn't the filter's own id. */
const parameters = new Map([
  ["type", "image_type"],
  ["color", "colors"],
  ["footage", "video_type"],
  ["editors", "editors_choice"]
])

/** Pixabay's own words for each type, which the filter names in the plural, as the window shows them. */
const imageTypes = new Map([
  ["photos", "photo"],
  ["illustrations", "illustration"],
  ["vectors", "vector"]
])

/**
 * Searches Pixabay's images, or its videos when the type is videos. A search for videos by kind is one for the videos
 * type, so an agent can ask either way.
 */
async function searchPixabay(request: SearchRequest, access: Access): Promise<SearchAnswer> {
  if (request.query.trim().length > queryLimit) {
    return invalid("query", `Pixabay searches can be up to ${queryLimit} letters.`)
  }

  const type = request.filters?.type

  if (request.kind === "videos" && type !== undefined && type !== "videos") {
    return invalid("filters.type", "A search for videos takes the videos type.")
  }

  const asked = request.kind === "videos" ? { ...request, filters: { ...request.filters, type: "videos" } } : request
  const prepared = prepare(pixabay.info, asked, access)

  if ("problem" in prepared) {
    return prepared
  }

  const { query, limit, page = 1, filters } = prepared.request

  if ((page - 1) * limit >= reachable) {
    return { found: [] }
  }

  const videos = filters.type === "videos"

  // Safe search keeps out anything unsuitable for every audience, since designs are shown to others.
  const params = new URLSearchParams({
    key: prepared.key,
    q: query.trim(),
    per_page: String(Math.max(fewestPerPage, limit)),
    page: String(page),
    safesearch: "true"
  })

  // checkRequest has kept them to the values above, and to the ones that apply to the type.
  for (const [id, value] of Object.entries(filters)) {
    if (id !== "type") {
      params.set(parameters.get(id) ?? id, value)
    } else if (!videos) {
      params.set("image_type", imageTypes.get(value) ?? value)
    }
  }

  // Pixabay takes its key only in the address, so the address is never logged or shown.
  const url = `${videos ? api.videos : api.images}?${params}`

  if (videos) {
    return sendSearch(access, {
      source: "Pixabay",
      url,
      init: {},
      schema: clips,
      found: (data) => data.hits.slice(0, limit).map((each) => foundVideo(each)),
      refused
    })
  }

  const expiresAt = Date.now() + linkLife

  return sendSearch(access, {
    source: "Pixabay",
    url,
    init: {},
    schema: answer,
    found: (data) => data.hits.slice(0, limit).map((each) => foundImage(each, expiresAt)),
    refused
  })
}

function invalid(field: string, message: string): ProblemAnswer {
  return { problem: { code: "invalid", message, field } }
}

function foundImage(each: z.infer<typeof hit>, expiresAt: number): Found {
  const scale = Math.min(1, largeSide / Math.max(each.imageWidth, each.imageHeight))

  return {
    ...common(each),
    kind: "photos",
    image: {
      url: each.largeImageURL,
      width: Math.round(each.imageWidth * scale),
      height: Math.round(each.imageHeight * scale),
      expiresAt
    },
    // Up to 640 pixels on its longer side.
    preview: { url: each.webformatURL, width: each.webformatWidth, height: each.webformatHeight, expiresAt }
  }
}

function foundVideo(each: z.infer<typeof clip>): Found {
  const { medium, tiny } = each.videos

  return {
    ...common(each),
    kind: "videos",
    image: { url: medium.thumbnail, width: medium.width, height: medium.height },
    video: { url: medium.url, width: medium.width, height: medium.height, duration: each.duration, preview: tiny.url }
  }
}

/** What an image and a video result share: who they're from, and what they're called. */
function common(each: Result): Pick<Found, "connector" | "id" | "title" | "link" | "credit"> {
  return {
    connector: "pixabay",
    id: String(each.id),
    title: titleOf(each),
    link: each.pageURL,
    credit: [
      { name: each.user, url: `https://pixabay.com/users/${encodeURIComponent(each.user)}-${each.user_id}/` },
      { name: "Pixabay", url: "https://pixabay.com/" }
    ]
  }
}

/** How many of an image's tags name it. Pixabay lists up to twenty, often repeated, most telling first. */
const titleTags = 3

/**
 * What a result shows: its description, without the closing period, or else its first few tags, as "Lake, mountains,
 * hut", or else who made it.
 */
function titleOf({ description, tags, user }: Result): string {
  const described = description?.trim().replace(/\.$/, "")

  if (described) {
    return capitalized(described)
  }

  const words = [...new Set(tags.split(",").map((tag) => tag.trim().toLowerCase()))].filter(Boolean)
  const title = words.slice(0, titleTags).join(", ")

  return title ? capitalized(title) : `By ${user}`
}

function capitalized(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** What each of Pixabay's failures means for the person. It answers a missing or wrong key with a 400. */
function refused(response: Response, body: string): ProblemAnswer {
  if (response.status === 429) {
    const answer = refusal("rate-limited", "Pixabay allows 100 searches a minute. Try again in a moment.")
    const wait = retryAfter(response.headers.get("x-ratelimit-reset"), Date.now())

    if (wait !== undefined) {
      answer.problem.retryAfter = wait
    }

    return answer
  }

  if (response.status === 400 && /api key/i.test(body)) {
    return refusal(
      "key-refused",
      "Pixabay turned down this copy of Parity's key, so it can't search Pixabay right now."
    )
  }

  if (response.status === 400) {
    return refusal("invalid", "Pixabay couldn't take this search. Try other words or filters.")
  }

  return refusal("unavailable", "Pixabay isn't answering right now. Try again in a moment.")
}
