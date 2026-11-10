import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { AgentHost } from "@parity-app/agent"
import type { Fetch, Found, SearchAnswer, SearchRequest } from "@parity-app/connectors"

type ReferencesRequest = Parameters<AgentHost["references"]>[0]

type PhotosRequest = Parameters<AgentHost["photos"]>[0]

/** What an agent's search answers, the same for screens and photos. */
type FindAnswer = Awaited<ReturnType<AgentHost["references"]>>

type FoundItem = FindAnswer["found"][number]

/** The picture types an agent's client shows, by the extension a saved preview gets. */
const previewTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as const

type PreviewType = keyof typeof previewTypes

/** The largest preview kept: Mobbin's and Unsplash's images are far smaller, so anything bigger is something else. */
const previewLimit = 4 * 1024 * 1024

export interface FindOptions {
  /** Asks main to find what the request names, since main holds the keys and knows which connector has one. */
  find(request: SearchRequest): Promise<SearchAnswer>
  fetch: Fetch
  /** Where previews are saved, for an agent to open. */
  folder: string
  /** How long fetching one preview may take, in milliseconds. */
  timeout: number
}

/** An agent's search for screens from real apps (PAR-829), from whichever connector finds them. */
export async function searchReferences(options: FindOptions, request: ReferencesRequest): Promise<FindAnswer> {
  const { query, platform, depth, limit, exclude } = request

  return find(options, { query, kind: "screens", filters: { platform, depth }, limit, exclude })
}

/** An agent's search for stock photos, from whichever connector finds them. */
export async function searchPhotos(options: FindOptions, request: PhotosRequest): Promise<FindAnswer> {
  const { query, orientation, color, limit, page } = request
  const filters: Record<string, string> = {}

  if (orientation) {
    filters.orientation = orientation
  }

  if (color) {
    filters.color = color
  }

  return find(options, { query, kind: "photos", filters, limit, page })
}

/**
 * Finds through main, then fetches each result's preview and saves it as a file, which MCP shows inline and the CLI
 * prints the path of. A preview that can't be fetched is left out, and the result is still listed with its link.
 */
async function find(options: FindOptions, request: SearchRequest): Promise<FindAnswer> {
  const answer = await options.find(request)

  if ("problem" in answer) {
    return { found: [], problem: answer.problem }
  }

  await mkdir(options.folder, { recursive: true })

  const found = await Promise.all(answer.found.map((each) => withPreview(options, each)))

  return answer.allowance ? { found, allowance: answer.allowance } : { found }
}

async function withPreview(options: FindOptions, found: Found): Promise<FoundItem> {
  const item: FoundItem = {
    id: found.id,
    source: found.credit.at(-1)?.name ?? found.connector,
    title: found.title,
    link: found.link,
    image: found.image.url,
    credit: found.credit
  }

  if (found.platform) {
    item.platform = found.platform
  }

  if (found.image.width !== undefined && found.image.height !== undefined) {
    item.width = found.image.width
    item.height = found.image.height
  }

  const preview = await fetchPreview(options, found.image.url)

  if (!preview) {
    return item
  }

  // Named by the result and what it shows, so the same one found again reuses its file.
  const hash = createHash("sha256").update(preview.bytes).digest("hex").slice(0, 8)
  const name = `${slug(found.title)}-${slug(found.id).slice(0, 8)}-${hash}.${previewTypes[preview.mimeType]}`
  const path = join(options.folder, name)
  await writeFile(path, preview.bytes)
  item.preview = { path, mimeType: preview.mimeType, data: preview.bytes.toString("base64") }

  return item
}

async function fetchPreview(
  options: FindOptions,
  url: string
): Promise<{ bytes: Buffer; mimeType: PreviewType } | undefined> {
  try {
    const response = await options.fetch(url, { signal: AbortSignal.timeout(options.timeout) })
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()

    if (!response.ok || !mimeType || !Object.hasOwn(previewTypes, mimeType)) {
      return undefined
    }

    const bytes = Buffer.from(await response.arrayBuffer())

    if (bytes.length === 0 || bytes.length > previewLimit) {
      return undefined
    }

    // SAFETY: `previewTypes` has it, checked above.
    return { bytes, mimeType: mimeType as PreviewType }
  } catch {
    return undefined
  }
}

/** Letters, digits and dashes only, in lower case, for a file name. */
function slug(text: string): string {
  return (
    text
      .replaceAll(/[^a-z0-9]+/gi, "-")
      .replaceAll(/^-|-$/g, "")
      .toLowerCase() || "found"
  )
}
