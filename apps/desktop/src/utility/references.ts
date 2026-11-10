import { createHash } from "node:crypto"
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { AgentHost } from "@parity-app/agent"
import { type Fetch, type Found, offered, type SearchAnswer, type SearchRequest } from "@parity-app/connectors"
import type { ConnectorFind } from "../shared/connectors.ts"

type ReferencesRequest = Parameters<AgentHost["references"]>[0]

type MediaRequest = Parameters<AgentHost["media"]>[0]

/** What an agent's search answers, the same for screens, pictures and videos. */
type FindAnswer = Awaited<ReturnType<AgentHost["references"]>>

type FoundItem = FindAnswer["found"][number]

/** A picture to fetch for an agent: what it's of and its id, which name its file, and its link. */
type Picture = Parameters<AgentHost["pictures"]>[0][number]

type SavedPicture = NonNullable<Awaited<ReturnType<AgentHost["pictures"]>>[number]>

/** The picture types an agent's client shows, by the extension a saved preview gets. */
const previewTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as const

type PreviewType = keyof typeof previewTypes

/** The largest preview kept: sources' previews are far smaller, so anything bigger is something else. */
const previewLimit = 4 * 1024 * 1024

/** The longest part of a preview's file name taken from what the source says, so a long title can't break the path. */
const nameLimit = 40

/**
 * How long a saved preview is kept, in milliseconds: long enough to look at again while working, and well inside the
 * 30 days Mobbin's links last. A preview is a copy to look at, not something to keep.
 */
const previewAge = 7 * 24 * 60 * 60 * 1000

export interface FindOptions {
  /** Asks main to find what the request names, since main holds the keys and knows which connector has one. */
  find(request: ConnectorFind): Promise<SearchAnswer>
  fetch: Fetch
  /** Where previews are saved, for an agent to open. */
  folder: string
  /** How long fetching one preview may take, in milliseconds. */
  timeout: number
}

/** The connector agents' references come from when they don't name one: the first offered that finds screens. */
const screensConnector = offered.find(({ info }) => info.finds.includes("screens"))?.info.id

/**
 * A screen main found lately, for an agent to place as a reference (PAR-840): from the connector named, or the one that
 * finds screens. A result that isn't a screen, as a stock photo, isn't one.
 */
export async function foundScreen(
  id: string,
  connector: string | undefined,
  result: (connector: string, id: string) => Promise<Found | null>
): Promise<Found | undefined> {
  const from = connector ?? screensConnector

  if (!from) {
    return undefined
  }

  const found = await result(from, id)

  return found?.kind === "screens" ? found : undefined
}

/** An agent's search for screens from real apps (PAR-829), from the connector it names or any that finds them. */
export async function searchReferences(options: FindOptions, request: ReferencesRequest): Promise<FindAnswer> {
  const { tab: _tab, query, connector, limit, exclude, page, ...filters } = request

  return find(options, connector, more({ query, kind: "screens", filters: defined(filters), limit }, exclude, page))
}

/**
 * An agent's search for stock pictures or videos, from the connector it names or any that finds them. The type filter
 * says which kind: videos, or pictures of any type.
 */
export async function searchMedia(options: FindOptions, request: MediaRequest): Promise<FindAnswer> {
  const { tab: _tab, query, connector, limit, exclude, page, ...filters } = request
  const kind = filters.type === "videos" ? "videos" : "photos"

  return find(options, connector, more({ query, kind, filters: defined(filters), limit }, exclude, page))
}

/** A search with the way of asking for more the agent used; main refuses the one its connector doesn't take. */
function more(search: SearchRequest, exclude: string[] | undefined, page: number | undefined): SearchRequest {
  if (exclude && exclude.length > 0) {
    search.exclude = exclude
  }

  if (page !== undefined) {
    search.page = page
  }

  return search
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
  await pruneOld(options.folder, Date.now() - previewAge)
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
    kind: found.kind,
    title: found.title,
    link: found.link,
    credit: found.credit
  }

  if (found.platform) {
    item.platform = found.platform
  }

  if (found.image.width !== undefined && found.image.height !== undefined) {
    item.width = found.image.width
    item.height = found.image.height
  }

  const preview = await savePicture(options, {
    title: found.title,
    id: found.id,
    url: (found.preview ?? found.image).url
  })

  if (preview) {
    item.preview = preview
  }

  return item
}

/**
 * The pictures of the references on the canvas, fetched and saved as a search's previews are, for an agent to look at
 * (PAR-889). One that can't be fetched or saved is undefined.
 */
export async function savePictures(options: FindOptions, pictures: Picture[]): Promise<(SavedPicture | undefined)[]> {
  const saved = await Promise.all(pictures.map((picture) => savePicture(options, picture)))
  await pruneOld(options.folder, Date.now() - previewAge)

  return saved
}

/** A picture fetched and saved under `folder`, or undefined when it can't be. */
async function savePicture(options: FindOptions, picture: Picture): Promise<SavedPicture | undefined> {
  try {
    const preview = await fetchPreview(options, picture.url)

    if (!preview) {
      return undefined
    }

    // Named by what it's of and what it shows, so the same one fetched again reuses its file.
    const hash = createHash("sha256").update(preview.bytes).digest("hex").slice(0, 8)
    const name = `${slug(picture.title)}-${slug(picture.id).slice(0, 8)}-${hash}.${previewTypes[preview.mimeType]}`
    const path = join(options.folder, name)
    await mkdir(options.folder, { recursive: true })
    await writeFile(path, preview.bytes)

    return { path, mimeType: preview.mimeType, data: preview.bytes.toString("base64") }
  } catch {
    // A preview is a convenience: without one, the result still has its link and image.
    return undefined
  }
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

/** Deletes previews saved before `before`, in milliseconds since the epoch. One that can't be deleted is left. */
async function pruneOld(folder: string, before: number): Promise<void> {
  const names = await readdir(folder).catch(() => [])

  for (const name of names) {
    const path = join(folder, name)
    const saved = await stat(path).catch(() => undefined)

    if (saved?.isFile() && saved.mtimeMs < before) {
      await rm(path, { force: true }).catch(() => undefined)
    }
  }
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
