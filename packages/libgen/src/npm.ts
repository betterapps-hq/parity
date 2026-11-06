import { parseData } from "@parity-app/core"
import { z } from "zod"

/**
 * npm's registry documents, as loose schemas of the fields libgen reads (PAR-599): a package's document, with every
 * version it has published, and one version's.
 */

const registry = "https://registry.npmjs.org"

/** One published version, as the package's document lists it. */
const listedVersion = z.looseObject({ gitHead: z.string().optional() })

/** A package's document. `time` has each version's publishing date, and an `unpublished` record when it was pulled. */
const npmPackage = z.looseObject({
  versions: z.record(z.string(), listedVersion).optional(),
  "dist-tags": z.record(z.string(), z.string()).optional(),
  time: z.object({ unpublished: z.unknown().optional() }).catchall(z.string()).optional()
})

/** One version's document: the commit it was published from, its repository and its tarball. */
const npmVersion = listedVersion.extend({
  repository: z.union([z.string(), z.looseObject({ url: z.string().optional() })]).optional(),
  dist: z.looseObject({ tarball: z.string().optional() }).optional()
})

export type NpmPackage = z.output<typeof npmPackage>
export type NpmVersion = z.output<typeof npmVersion>

/**
 * A package's document from npm. The abbreviated one npm installs from has no publishing dates; `full` asks for the
 * whole document, which has them. Throws when npm has no such package or its answer doesn't match.
 */
export async function packageDocument(
  name: string,
  options: { full?: boolean; signal?: AbortSignal } = {}
): Promise<NpmPackage> {
  const response = await fetch(`${registry}/${name.replace("/", "%2F")}`, {
    headers: { accept: options.full ? "application/json" : "application/vnd.npm.install-v1+json" },
    ...(options.signal ? { signal: options.signal } : {})
  })
  if (!response.ok) throw new Error(`npm has no ${name} (${response.status})`)
  return readDocument(npmPackage, await response.json(), name)
}

/** One version's document from npm. Throws when npm has no such version or its answer doesn't match. */
export async function versionDocument(name: string, version: string): Promise<NpmVersion> {
  const response = await fetch(`${registry}/${name.replace("/", "%2F")}/${version}`)
  if (!response.ok) throw new Error(`npm has no ${name}@${version} (${response.status})`)
  return readDocument(npmVersion, await response.json(), `${name}@${version}`)
}

function readDocument<T extends z.ZodType>(schema: T, value: unknown, what: string): z.output<T> {
  try {
    return parseData(schema, value)
  } catch (error) {
    throw new TypeError(`npm's document for ${what}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}
