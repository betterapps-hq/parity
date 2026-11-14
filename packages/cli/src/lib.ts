import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import type { GenerateOptions, Live, GenerateReport as Report } from "@parity-app/libgen"
import { z } from "zod"
import { readAppErrors } from "./check.ts"
import { invalidInput } from "./errors.ts"
import { stderr, stdout } from "./output.ts"

export interface LibOptions {
  root?: string
  out?: string
  registry?: boolean
  id?: string
  name?: string
  description?: string
  range?: string
  /** `new`, `all`, or component names separated by commas. */
  only?: string
  /** A shared file of hand edits, relative to the current folder. */
  edits?: string
  /** Set to skip reading the library's examples from its repository. */
  noExamples?: boolean
  /** Set to skip reading an icon set's tags from its published metadata. */
  noTags?: boolean
  json?: boolean
}

/**
 * `parity lib`: writes a `.lib.par` by inspecting a package or the app itself. It runs on its own, with no app open,
 * because it reads the project's files and its own copy of TypeScript.
 */
export async function runLib(packageName: string | undefined, options: LibOptions): Promise<void> {
  // Loaded only here, so the other commands don't load TypeScript.
  const { appManifestPath, generateLibrary, manifestText, mergeManifest, reviseLibrary } =
    await import("@parity-app/libgen")

  const { covers, registryDir, registryEntries, registryFileName } = await import("@parity-app/registry")
  const spec = packageName === undefined ? undefined : packageSpec(packageName)
  let root = resolve(options.root ?? ".")

  // A package named with a version, or one written into the registry with no project given, is installed on its own at
  // that version, so describing it needs no project that has it. Regenerating a registry file reads the version it
  // covers; one new to the registry reads npm's latest.
  if (spec && (spec.version !== undefined || (options.registry && !options.root))) {
    const { installedVersion, publishedVersion } = await import("@parity-app/libgen/published")
    const listed = (await registryEntries()).filter((entry) => entry.manifest.package?.name === spec.name)

    if (spec.version === undefined && listed.length > 1) {
      throw invalidInput(
        "package",
        `The registry has ${listed.length} files for ${spec.name}; name a version, as ${spec.name}@1.2.3`
      )
    }

    const version = await publishedVersion(spec.name, spec.version ?? listed[0]?.manifest.package?.version ?? "latest")
    stderr(`Installing ${spec.name} ${version} on its own…`)
    root = await installedVersion(spec.name, version)
  }

  const { parseLibraryEdits } = await import("@parity-app/libgen")

  const trialEdits = options.edits
    ? parseLibraryEdits(JSON.parse(await readFile(resolve(options.edits), "utf8")))
    : undefined

  // A registry file is made again with the app's errors `parity lib check --record` kept for it.
  const recordedId =
    options.registry && spec
      ? (options.id ??
        (await registryEntries()).find((entry) => entry.manifest.package?.name === spec.name)?.manifest.id)
      : undefined

  const appErrors = recordedId ? await readAppErrors(registryDir(), recordedId) : undefined

  const generated = await generateLibrary(generateOptions(root, options, { spec, trialEdits, appErrors }))

  const id = String(generated.manifest.id)
  let target: string | undefined

  if (options.out === "-") {
    target = undefined
  } else if (options.out) {
    target = resolve(options.out)
  } else if (options.registry) {
    // Named for its package, so a project's packages find their files without opening the rest (PAR-1086): the file
    // that covers the version it describes, else the package's own name, with the major version when the package has
    // a file already.
    const described = generated.manifest.package
    const name = described?.name ?? spec?.name

    if (!name) {
      throw invalidInput("package", "A registry file names the package it describes")
    }

    const files = (await registryEntries()).filter((entry) => entry.manifest.package?.name === name)
    const major = described?.version === undefined ? Number.NaN : Number.parseInt(described.version, 10)
    const covering = files.find((entry) => covers(entry.manifest, described?.version))

    target = join(
      registryDir(),
      covering?.file ?? registryFileName(name, files.length > 0 && Number.isFinite(major) ? major : undefined)
    )
  } else if (packageName) {
    target = resolve(`${id}.lib.par`)
  } else {
    target = await appManifestPath(root)
  }

  // The file being replaced, for what changed and the hand edits it keeps.
  const existing = target
    ? await readFile(target, "utf8").then(
        (text): Live => JSON.parse(text),
        () => undefined
      )
    : undefined

  if (!options.range) {
    const read = packageVersions.safeParse(generated.manifest.package).data
    const written = writtenRange.safeParse(existing).data?.package.range
    const range = read && keptRange(written, read, (versions) => covers({ package: versions }, read.version))

    if (range) {
      generated.manifest.package = { ...read, range }
    }
  }

  let only: "all" | "new" | string[]

  if (!options.only || options.only === "all") {
    only = "all"
  } else {
    only = options.only === "new" ? "new" : options.only.split(",")
  }

  const edits = options.edits && relative(dirname(target ?? resolve(".")), resolve(options.edits)).replaceAll("\\", "/")

  const revision: ReviseOptions = { root, previous: existing, only, editsBase: dirname(target ?? resolve(".")) }

  if (edits) {
    revision.edits = edits
  }

  const { manifest, report } = await reviseLibrary(generated, revision)

  if (!target) {
    stdout(JSON.stringify(manifest, null, 2))
    stderr(describeReport(report))

    return
  }

  // An app's own file keeps what its author wrote, such as its canvas of designs.
  const written = packageName ? manifest : mergeManifest(existing, manifest)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, manifestText(written))

  if (options.json) {
    stdout(JSON.stringify({ path: target, report }, null, 2))
  } else {
    stdout(`Wrote ${relative(process.cwd(), target) || target}\n${describeReport(report)}`)
  }
}

/** What `reviseLibrary` takes: the file being replaced, which components to write, and where hand edits are. */
type ReviseOptions = Pick<GenerateOptions, "previous" | "only" | "edits" | "editsBase" | "root">

/** What `parity lib` found before generating: the package named, hand edits to try, and the app's recorded errors. */
interface LibInputs {
  spec: PackageSpec | undefined
  trialEdits: GenerateOptions["trialEdits"]
  appErrors: GenerateOptions["appErrors"]
}

/** The options `generateLibrary` is given, with only the flags that were set. */
function generateOptions(
  root: string,
  options: LibOptions,
  { spec, trialEdits, appErrors }: LibInputs
): GenerateOptions {
  const generate: GenerateOptions = { root }

  if (trialEdits) {
    generate.trialEdits = trialEdits
  }

  if (appErrors) {
    generate.appErrors = appErrors
  }

  if (options.noExamples) {
    generate.examples = false
  }

  if (options.noTags) {
    generate.tags = false
  }

  if (spec) {
    generate.package = spec.name
  }

  if (options.id) {
    generate.id = options.id
  }

  if (options.name) {
    generate.name = options.name
  }

  if (options.description) {
    generate.description = options.description
  }

  if (options.range) {
    generate.range = options.range
  }

  return generate
}

/** The package a library file describes: the version read, and the range of versions the file covers. */
const packageVersions = z.looseObject({ name: z.string(), version: z.string(), range: z.string() })

type PackageVersions = z.output<typeof packageVersions>

/** The range a file being written over has, which it keeps while that still covers the version read. */
export const writtenRange = z.looseObject({ package: z.looseObject({ range: z.string() }) })

/**
 * The range a file being written over keeps: its own, while it still covers the version just read, so a range widened
 * by hand (Lucide's, from 0.400) survives regenerating. Undefined when the new range stands.
 */
export function keptRange(
  range: string | undefined,
  read: PackageVersions,
  covers: (versions: PackageVersions) => boolean
): string | undefined {
  if (range === undefined || range === read.range) {
    return undefined
  }

  return covers({ ...read, range }) ? range : undefined
}

/** A package as `parity lib` is given it: a name, with a version or tag after an `@` (`@tabler/icons-react@3.50.0`). */
export interface PackageSpec {
  name: string
  version?: string
}

/** Reads a package as `parity lib` is given it. */
export function packageSpec(text: string): PackageSpec {
  const at = text.lastIndexOf("@")

  return at > 0 ? { name: text.slice(0, at), version: text.slice(at + 1) } : { name: text }
}

/** The report in plain words: what was found, then what couldn't be decided. */
export function describeReport(report: Report): string {
  const lines: string[] = []
  const from = report.package ? ` from ${report.package.name} ${report.package.version}` : ""
  let kind = "a component library"

  if (report.kind === "icons") {
    kind = "an icon set"
  } else if (report.kind === "app") {
    kind = "an app"
  }

  lines.push(`Described ${kind}${from}.`)

  if (report.kind === "icons") {
    lines.push(`  ${report.icons ?? 0} icons`)
  }

  if (report.iconTags) {
    const { matched, of, source } = report.iconTags
    lines.push(`  Tags for ${matched} of ${of} icons, from ${source}`)
  } else {
    lines.push(`  ${report.components} components`)
  }

  const tokens = Object.entries(report.tokens)
  const total = tokens.reduce((sum, [, count]) => sum + (count ?? 0), 0)

  if (total > 0) {
    const themes = report.themes.length > 0 ? `, with ${report.themes.join(", ")} themes` : ""
    lines.push(`  ${total} tokens${themes}: ${tokens.map(([category, count]) => `${count} ${category}`).join(", ")}`)
  }

  if (report.breakpoints > 0) {
    lines.push(`  ${report.breakpoints} breakpoints`)
  }

  for (const decorator of report.decorators) {
    lines.push(`  Decorator: ${decorator}`)
  }

  if (report.providers.length > 0) {
    lines.push(`  Providers and hosts it exports: ${report.providers.join(", ")}`)
  }

  if (report.ambiguous.length > 0) {
    lines.push(`Left out, because the types can't say (${report.ambiguous.length}):`)

    for (const entry of report.ambiguous.slice(0, 20)) {
      lines.push(`  ${entry.name}: ${entry.reason}`)
    }

    if (report.ambiguous.length > 20) {
      lines.push(`  and ${report.ambiguous.length - 20} more (--json lists them)`)
    }
  }

  if (report.examples) {
    const { repo, commit, how, files, used } = report.examples

    const matched = {
      upstream: "the revision it records",
      gitHead: "npm's gitHead",
      tag: "its tag",
      date: "its publish date"
    }[how]

    lines.push(
      `  Examples: ${files} files from ${repo} at ${commit.slice(0, 10)} (by ${matched}), using ${used} of its components`
    )
  }

  if (report.anatomy) {
    const { parts, placed, complete, differ } = report.anatomy
    lines.push(
      `  Anatomy: of ${parts} parts its docs nest, ${placed} are placed as they show and ${complete} have every level`
    )

    for (const entry of differ.slice(0, 10)) {
      lines.push(`    ${entry.name}: docs ${entry.docs.join(" > ")}; file ${entry.file.join(" > ") || "no parents"}`)
    }

    if (differ.length > 10) {
      lines.push(`    and ${differ.length - 10} more (--json lists them)`)
    }
  }

  if (report.parts) {
    const parts = report.parts
    const signals = Object.entries(parts.parents).map(([signal, count]) => `${count} by ${signal}`)
    lines.push(`  Parents: ${signals.join(", ") || "none"}`)
    lines.push(
      `  ${parts.failedAlone} components fail alone with no props; ${parts.fixed} render inside their parents with samples`
    )

    if (parts.failing.length > 0) {
      lines.push(`Still failing, for a hand edit (${parts.failing.length}):`)

      for (const entry of parts.failing.slice(0, 20)) {
        lines.push(`  ${entry.name}: ${entry.error.slice(0, 120)}`)
      }

      if (parts.failing.length > 20) {
        lines.push(`  and ${parts.failing.length - 20} more (--json lists them)`)
      }
    }
  }

  if (report.changes) {
    const changes = report.changes
    lines.push(
      `Since the last file: ${changes.added.length} new, ${changes.changed.length} changed, ${changes.removed.length} removed, ${changes.unchanged} unchanged`
    )

    if (changes.added.length > 0) {
      lines.push(`  New: ${changes.added.slice(0, 30).join(", ")}`)
    }

    for (const change of changes.changed.slice(0, 20)) {
      const parts = [
        change.added.length > 0 ? `props added ${change.added.join(", ")}` : "",
        change.removed.length > 0 ? `removed ${change.removed.join(", ")}` : "",
        change.retyped.length > 0 ? `retyped ${change.retyped.join(", ")}` : "",
        change.as ? `now ${change.as}` : ""
      ].filter(Boolean)

      lines.push(`  Changed ${change.name}: ${parts.join("; ") || "no fingerprint before"}`)
    }

    if (changes.removed.length > 0) {
      lines.push(`  Removed: ${changes.removed.join(", ")}`)
    }
  }

  if (report.orphanEdits?.length) {
    lines.push(
      `Hand edits for exports it no longer has, kept for you to move or delete: ${report.orphanEdits.join(", ")}`
    )
  }

  for (const note of report.notes) {
    lines.push(`Note: ${note}`)
  }

  return lines.join("\n")
}
