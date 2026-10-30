import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import type { GenerateReport as Report } from "@parity-app/libgen"

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
  const { covers, registryDir, registryEntries } = await import("@parity-app/registry")
  const spec = packageName === undefined ? undefined : packageSpec(packageName)
  let root = resolve(options.root ?? ".")
  // A package named with a version, or one written into the registry with no project given, is installed on its own at
  // that version, so describing it needs no project that has it. Regenerating a registry file reads the version it
  // covers; one new to the registry reads npm's latest.
  if (spec && (spec.version !== undefined || (options.registry && !options.root))) {
    const { installedVersion, publishedVersion } = await import("@parity-app/libgen/published")
    const listed = (await registryEntries()).filter((entry) => entry.manifest.package?.name === spec.name)
    if (spec.version === undefined && listed.length > 1) {
      throw new Error(`The registry has ${listed.length} files for ${spec.name}; name a version, as ${spec.name}@1.2.3`)
    }
    const version = await publishedVersion(spec.name, spec.version ?? listed[0]?.manifest.package?.version ?? "latest")
    console.error(`Installing ${spec.name} ${version} on its own…`)
    root = await installedVersion(spec.name, version)
  }
  const { parseLibraryEdits } = await import("@parity-app/libgen")
  const trialEdits = options.edits
    ? parseLibraryEdits(JSON.parse(await readFile(resolve(options.edits), "utf8")))
    : undefined
  const generated = await generateLibrary({
    root,
    ...(trialEdits ? { trialEdits } : {}),
    ...(options.noExamples ? { examples: false } : {}),
    ...(options.noTags ? { tags: false } : {}),
    ...(spec ? { package: spec.name } : {}),
    ...(options.id ? { id: options.id } : {}),
    ...(options.name ? { name: options.name } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.range ? { range: options.range } : {})
  })
  const id = String(generated.manifest.id)
  let target: string | undefined
  if (options.out === "-") target = undefined
  else if (options.out) target = resolve(options.out)
  else if (options.registry) target = join(registryDir(), `${id}.lib.par`)
  else if (packageName) target = resolve(`${id}.lib.par`)
  else target = await appManifestPath(root)
  // The file being replaced, for what changed and the hand edits it keeps.
  const existing = target
    ? await readFile(target, "utf8").then(
        (text) => JSON.parse(text) as unknown,
        () => undefined
      )
    : undefined
  if (!options.range) {
    const read = generated.manifest.package as PackageVersions | undefined
    const range =
      read &&
      keptRange(existing, read, (versions) =>
        covers({ package: versions } as Parameters<typeof covers>[0], read.version)
      )
    if (range) generated.manifest.package = { ...read, range }
  }
  let only: "all" | "new" | string[]
  if (!options.only || options.only === "all") only = "all"
  else only = options.only === "new" ? "new" : options.only.split(",")
  const edits = options.edits && relative(dirname(target ?? resolve(".")), resolve(options.edits)).replaceAll("\\", "/")
  const { manifest, report } = await reviseLibrary(generated, {
    root,
    previous: existing,
    only,
    ...(edits ? { edits } : {}),
    editsBase: dirname(target ?? resolve("."))
  })
  if (!target) {
    console.log(JSON.stringify(manifest, null, 2))
    console.error(describeReport(report))
    return
  }
  // An app's own file keeps what its author wrote, such as its canvas of designs.
  const written = packageName ? manifest : mergeManifest(existing, manifest)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, manifestText(written))
  if (options.json) console.log(JSON.stringify({ path: target, report }, null, 2))
  else console.log(`Wrote ${relative(process.cwd(), target) || target}\n${describeReport(report)}`)
}

interface PackageVersions {
  name: string
  version: string
  range: string
}

/**
 * The range a file being written over keeps: its own, while it still covers the version just read, so a range widened
 * by hand (Lucide's, from 0.400) survives regenerating. Undefined when the new range stands.
 */
export function keptRange(
  existing: unknown,
  read: PackageVersions,
  covers: (versions: PackageVersions) => boolean
): string | undefined {
  const range = (existing as { package?: { range?: unknown } } | undefined)?.package?.range
  if (typeof range !== "string" || range === read.range) return undefined
  return covers({ ...read, range }) ? range : undefined
}

/** A package as `parity lib` is given it: a name, with a version or tag after an `@` (`@tabler/icons-react@3.50.0`). */
export function packageSpec(text: string): { name: string; version?: string } {
  const at = text.lastIndexOf("@")
  return at > 0 ? { name: text.slice(0, at), version: text.slice(at + 1) } : { name: text }
}

/** The report in plain words: what was found, then what couldn't be decided. */
export function describeReport(report: Report): string {
  const lines: string[] = []
  const from = report.package ? ` from ${report.package.name} ${report.package.version}` : ""
  let kind = "a component library"
  if (report.kind === "icons") kind = "an icon set"
  else if (report.kind === "app") kind = "an app"
  lines.push(`Described ${kind}${from}.`)
  if (report.kind === "icons") lines.push(`  ${report.icons ?? 0} icons`)
  if (report.iconTags) {
    const { matched, of, source } = report.iconTags
    lines.push(`  Tags for ${matched} of ${of} icons, from ${source}`)
  } else lines.push(`  ${report.components} components`)
  const tokens = Object.entries(report.tokens)
  const total = tokens.reduce((sum, [, count]) => sum + (count ?? 0), 0)
  if (total > 0) {
    const themes = report.themes.length > 0 ? `, with ${report.themes.join(", ")} themes` : ""
    lines.push(`  ${total} tokens${themes}: ${tokens.map(([category, count]) => `${count} ${category}`).join(", ")}`)
  }
  if (report.breakpoints > 0) lines.push(`  ${report.breakpoints} breakpoints`)
  for (const decorator of report.decorators) lines.push(`  Decorator: ${decorator}`)
  if (report.providers.length > 0) lines.push(`  Providers and hosts it exports: ${report.providers.join(", ")}`)
  if (report.ambiguous.length > 0) {
    lines.push(`Left out, because the types can't say (${report.ambiguous.length}):`)
    for (const entry of report.ambiguous.slice(0, 20)) lines.push(`  ${entry.name}: ${entry.reason}`)
    if (report.ambiguous.length > 20) lines.push(`  and ${report.ambiguous.length - 20} more (--json lists them)`)
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
    if (differ.length > 10) lines.push(`    and ${differ.length - 10} more (--json lists them)`)
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
      for (const entry of parts.failing.slice(0, 20)) lines.push(`  ${entry.name}: ${entry.error.slice(0, 120)}`)
      if (parts.failing.length > 20) lines.push(`  and ${parts.failing.length - 20} more (--json lists them)`)
    }
  }
  if (report.changes) {
    const changes = report.changes
    lines.push(
      `Since the last file: ${changes.added.length} new, ${changes.changed.length} changed, ${changes.removed.length} removed, ${changes.unchanged} unchanged`
    )
    if (changes.added.length > 0) lines.push(`  New: ${changes.added.slice(0, 30).join(", ")}`)
    for (const change of changes.changed.slice(0, 20)) {
      const parts = [
        change.added.length > 0 ? `props added ${change.added.join(", ")}` : "",
        change.removed.length > 0 ? `removed ${change.removed.join(", ")}` : "",
        change.retyped.length > 0 ? `retyped ${change.retyped.join(", ")}` : "",
        change.as ? `now ${change.as}` : ""
      ].filter(Boolean)
      lines.push(`  Changed ${change.name}: ${parts.join("; ") || "no fingerprint before"}`)
    }
    if (changes.removed.length > 0) lines.push(`  Removed: ${changes.removed.join(", ")}`)
  }
  if (report.orphanEdits?.length) {
    lines.push(
      `Hand edits for exports it no longer has, kept for you to move or delete: ${report.orphanEdits.join(", ")}`
    )
  }
  for (const note of report.notes) lines.push(`Note: ${note}`)
  return lines.join("\n")
}
