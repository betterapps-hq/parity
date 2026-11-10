import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { AgentHost } from "@parity-app/agent"
import type { Fetch, Found, SearchAnswer } from "@parity-app/connectors"
import type { ConnectorSearch } from "../shared/connectors.ts"

type ReferencesRequest = Parameters<AgentHost["references"]>[0]

type ReferencesAnswer = Awaited<ReturnType<AgentHost["references"]>>

type Reference = ReferencesAnswer["found"][number]

/** The picture types an agent's client shows, by the extension a saved preview gets. */
const previewTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as const

type PreviewType = keyof typeof previewTypes

/** The largest preview kept: Mobbin's optimized images are far smaller, so anything bigger is something else. */
const previewLimit = 4 * 1024 * 1024

export interface ReferencesOptions {
  /** Asks main to search, since main holds the keys. */
  search(search: ConnectorSearch): Promise<SearchAnswer>
  fetch: Fetch
  /** Where previews are saved, for an agent to open. */
  folder: string
  /** How long fetching one preview may take, in milliseconds. */
  timeout: number
}

/**
 * An agent's references search (PAR-829): Mobbin's screens, through main, each with its preview fetched and saved as a
 * file, which MCP shows inline and the CLI prints the path of. A preview that can't be fetched is left out, and the
 * screen is still listed with its link.
 */
export async function searchReferences(
  options: ReferencesOptions,
  request: ReferencesRequest
): Promise<ReferencesAnswer> {
  const { query, platform, depth, limit, exclude } = request

  const answer = await options.search({
    connector: "mobbin",
    request: { query, kind: "screens", platform, depth, limit, exclude }
  })

  if ("problem" in answer) {
    return { found: [], problem: answer.problem }
  }

  await mkdir(options.folder, { recursive: true })

  return { found: await Promise.all(answer.found.map((found) => withPreview(options, found))) }
}

async function withPreview(options: ReferencesOptions, found: Found): Promise<Reference> {
  const reference: Reference = {
    id: found.id,
    app: found.title,
    platform: found.platform ?? "web",
    link: found.link,
    image: found.image.url
  }

  if (found.image.width !== undefined && found.image.height !== undefined) {
    reference.width = found.image.width
    reference.height = found.image.height
  }

  const preview = await fetchPreview(options, found.image.url)

  if (!preview) {
    return reference
  }

  // Named by the screen and what it shows, so the same screen found again reuses its file.
  const hash = createHash("sha256").update(preview.bytes).digest("hex").slice(0, 8)
  const name = `${slug(found.title)}-${slug(found.id).slice(0, 8)}-${hash}.${previewTypes[preview.mimeType]}`
  const path = join(options.folder, name)
  await writeFile(path, preview.bytes)
  reference.preview = { path, mimeType: preview.mimeType, data: preview.bytes.toString("base64") }

  return reference
}

async function fetchPreview(
  options: ReferencesOptions,
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
      .toLowerCase() || "screen"
  )
}
