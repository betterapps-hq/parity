import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { AgentHost } from "@parity-app/agent"
import type { Fetch, Found, SearchAnswer, SearchRequest } from "@parity-app/connectors"
import type { ConnectorFind } from "../shared/connectors.ts"

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

/** The longest part of a preview's file name taken from what the source says, so a long title can't break the path. */
const nameLimit = 40

export interface FindOptions {
  /** Asks main to find what the request names, since main holds the keys and knows which connector has one. */
  find(request: ConnectorFind): Promise<SearchAnswer>
  fetch: Fetch
  /** Where previews are saved, for an agent to open. */
  folder: string
  /** How long fetching one preview may take, in milliseconds. */
  timeout: number
}

/** An agent's search for screens from real apps (PAR-829), from the connector it names or any that finds them. */
export async function searchReferences(options: FindOptions, request: ReferencesRequest): Promise<FindAnswer> {
  const { tab: _tab, query, connector, limit, exclude, ...filters } = request

  return find(options, connector, { query, kind: "screens", filters: defined(filters), limit, exclude })
}

/** An agent's search for stock photos, from the connector it names or any that finds them. */
export async function searchPhotos(options: FindOptions, request: PhotosRequest): Promise<FindAnswer> {
  const { tab: _tab, query, connector, limit, page, ...filters } = request
  const search: SearchRequest = { query, kind: "photos", filters: defined(filters), limit }

  if (page !== undefined) {
    search.page = page
  }

  return find(options, connector, search)
}

/**
 * The filters an agent set, by the ids connectors name them by: every field besides the search's own, so a filter a new
 * connector adds reaches it without a change here. Main checks them against the connector.
 */
function defined(filters: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
}

/**
 * Finds through main, then fetches each result's preview and saves it as a file, which MCP shows inline and the CLI
 * prints the path of. A preview that can't be fetched or saved is left out, and the result is still listed with its
 * link.
 */
async function find(options: FindOptions, connector: string | undefined, request: SearchRequest): Promise<FindAnswer> {
  const answer = await options.find(connector ? { connector, request } : { request })

  if ("problem" in answer) {
    return { found: [], problem: answer.problem }
  }

  const found = await Promise.all(answer.found.map((each) => withPreview(options, each)))
  const result: FindAnswer = { found }

  if (answer.allowance) {
    result.allowance = answer.allowance
  }

  // Asking for more and getting none means the search has run out, not that nothing matches.
  if (found.length === 0 && ((request.exclude?.length ?? 0) > 0 || (request.page ?? 1) > 1)) {
    result.done = true
  }

  return result
}

async function withPreview(options: FindOptions, found: Found): Promise<FoundItem> {
  const item: FoundItem = {
    id: found.id,
    connector: found.connector,
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

  try {
    const preview = await fetchPreview(options, (found.preview ?? found.image).url)

    if (preview) {
      // Named by the result and what it shows, so the same one found again reuses its file.
      const hash = createHash("sha256").update(preview.bytes).digest("hex").slice(0, 8)
      const name = `${slug(found.title)}-${slug(found.id).slice(0, 8)}-${hash}.${previewTypes[preview.mimeType]}`
      const path = join(options.folder, name)
      await mkdir(options.folder, { recursive: true })
      await writeFile(path, preview.bytes)
      item.preview = { path, mimeType: preview.mimeType, data: preview.bytes.toString("base64") }
    }
  } catch {
    // A preview is a convenience: without one, the result still has its link and image.
  }

  return item
}

async function fetchPreview(
  options: FindOptions,
  url: string
): Promise<{ bytes: Buffer; mimeType: PreviewType } | undefined> {
  try {
    const response = await options.fetch(url, { signal: AbortSignal.timeout(options.timeout) })
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
    const length = Number(response.headers.get("content-length") ?? 0)

    if (!response.ok || !mimeType || !Object.hasOwn(previewTypes, mimeType) || length > previewLimit) {
      await response.body?.cancel()

      return undefined
    }

    const bytes = await readUpTo(response, previewLimit)

    if (!bytes || bytes.length === 0) {
      return undefined
    }

    // SAFETY: `previewTypes` has it, checked above.
    return { bytes, mimeType: mimeType as PreviewType }
  } catch {
    return undefined
  }
}

/** A response's body, or nothing once it passes `limit` bytes, which stops reading it there. */
async function readUpTo(response: Response, limit: number): Promise<Buffer | undefined> {
  const reader = response.body?.getReader()

  if (!reader) {
    return undefined
  }

  const chunks: Uint8Array[] = []
  let size = 0

  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length

    if (size > limit) {
      await reader.cancel()

      return undefined
    }

    chunks.push(read.value)
  }

  return Buffer.concat(chunks)
}

/** Letters, digits and dashes only, in lower case and kept short, for a file name. */
function slug(text: string): string {
  return (
    text
      .replaceAll(/[^a-z0-9]+/gi, "-")
      .slice(0, nameLimit)
      .replaceAll(/^-|-$/g, "")
      .toLowerCase() || "found"
  )
}
