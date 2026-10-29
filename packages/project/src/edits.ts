/*
 * Project edits: changes to a project's files built as data, so they can be shown as a diff before they're written,
 * applied together and undone together. Building, planning and diffing one is pure; the project service reads the files
 * an edit touches, applies the plan and keeps it to undo.
 */

/** What a file holds: its text, or the bytes of a binary file such as an image. */
export type FileContent = string | Uint8Array

/**
 * One file's part in a project edit. Each says what it expects to find, so a file that changed since the edit was
 * built is left alone rather than overwritten: `create` expects no file, `replace` and `delete` exactly what's there,
 * and `patch` its `find` text once.
 */
export type FileEdit =
  | { kind: "create"; path: string; content: FileContent }
  | { kind: "replace"; path: string; expected: FileContent; content: FileContent }
  | { kind: "patch"; path: string; find: string; replace: string }
  | { kind: "delete"; path: string; expected: FileContent }

/** Edits to a project's files, shown, applied and undone together. `label` says what they're for, as an undo step does. */
export interface ProjectEdit {
  label: string
  files: FileEdit[]
}

/** A file before and after an edit, by its path from the project's root; a side is missing where there's no file. */
export interface FileChange {
  path: string
  before?: FileContent
  after?: FileContent
}

/** An edit that can't be applied because files no longer hold what it expected. */
export class EditConflict extends Error {
  readonly paths: string[]

  constructor(paths: string[]) {
    super(`${paths.join(", ")} changed since this was made, so nothing was written`)
    this.name = "EditConflict"
    this.paths = paths
  }
}

/**
 * What an edit does to each file, given what the files it touches hold now (missing, or `undefined`, for a file that
 * doesn't exist). Edits to the same file apply in order, and a file left as it was isn't listed. Throws an
 * `EditConflict` naming every file that isn't as the edit expects.
 */
export function planEdit(edit: ProjectEdit, current: ReadonlyMap<string, FileContent | undefined>): FileChange[] {
  const before = new Map<string, FileContent | undefined>()
  const state = new Map<string, FileContent | undefined>()
  const conflicts = new Set<string>()
  for (const file of edit.files) {
    if (!before.has(file.path)) {
      before.set(file.path, current.get(file.path))
      state.set(file.path, current.get(file.path))
    }
    const next = applyFile(file, state.get(file.path))
    if (next) state.set(file.path, next.content)
    else conflicts.add(file.path)
  }
  if (conflicts.size > 0) throw new EditConflict([...conflicts])
  return [...before].flatMap(([path, was]) => {
    const after = state.get(path)
    if (was === undefined ? after === undefined : after !== undefined && sameContent(was, after)) return []
    return [{ path, ...(was === undefined ? {} : { before: was }), ...(after === undefined ? {} : { after }) }]
  })
}

/** The edit that takes `changes` back, expecting each file to still hold what the change left in it. */
export function reverseEdit(label: string, changes: readonly FileChange[]): ProjectEdit {
  return {
    label,
    files: changes.flatMap(({ path, before, after }): FileEdit[] => {
      if (after === undefined) return before === undefined ? [] : [{ kind: "create", path, content: before }]
      if (before === undefined) return [{ kind: "delete", path, expected: after }]
      return [{ kind: "replace", path, expected: after, content: before }]
    })
  }
}

/**
 * A file's change as a unified diff with three lines of context, as git shows one. A binary file is described by its
 * size instead.
 */
export function diffFile({ path, before, after }: FileChange): string {
  if (before instanceof Uint8Array || after instanceof Uint8Array) {
    const was = before === undefined ? undefined : describeSize(bytes(before).length)
    const now = after === undefined ? undefined : describeSize(bytes(after).length)
    if (was === undefined) return `Binary file ${path}: added, ${now}`
    if (now === undefined) return `Binary file ${path}: deleted, ${was}`
    return `Binary file ${path}: ${was} before, ${now} after`
  }
  const header = [
    `--- ${before === undefined ? "/dev/null" : `a/${path}`}`,
    `+++ ${after === undefined ? "/dev/null" : `b/${path}`}`
  ]
  return [...header, ...hunks(diffLines(lines(before ?? ""), lines(after ?? "")))].join("\n")
}

function applyFile(file: FileEdit, now: FileContent | undefined): { content: FileContent | undefined } | undefined {
  switch (file.kind) {
    case "create":
      return now === undefined ? { content: file.content } : undefined
    case "replace":
      return now !== undefined && sameContent(now, file.expected) ? { content: file.content } : undefined
    case "delete":
      return now !== undefined && sameContent(now, file.expected) ? { content: undefined } : undefined
    case "patch": {
      if (typeof now !== "string" || file.find === "") return undefined
      const at = now.indexOf(file.find)
      if (at < 0 || now.includes(file.find, at + 1)) return undefined
      return { content: now.slice(0, at) + file.replace + now.slice(at + file.find.length) }
    }
  }
}

function sameContent(a: FileContent, b: FileContent): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b
  const left = bytes(a)
  const right = bytes(b)
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function bytes(content: FileContent): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content
}

function describeSize(length: number): string {
  return length < 1024 ? `${length} bytes` : `${Math.round(length / 1024)} KB`
}

/** A text's lines, each with its line break, so a last line without one differs from the same line with one. */
function lines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

interface Line {
  /** Kept, taken out or put in, as a diff marks it. */
  mark: " " | "-" | "+"
  text: string
}

/** The lines of `a` and `b` as kept, taken out and put in, keeping as many as it can. */
function diffLines(a: string[], b: string[]): Line[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const kept = (text: string): Line => ({ mark: " ", text })
  return [
    ...a.slice(0, start).map(kept),
    ...middle(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map(kept)
  ]
}

/**
 * The longest run of lines `a` and `b` have in common, between what changed. Edits change a few lines of a file, so this
 * is small; past a few million cells it gives every line as taken out and put in.
 */
function middle(a: string[], b: string[]): Line[] {
  const takenOut = a.map((text): Line => ({ mark: "-", text }))
  const putIn = b.map((text): Line => ({ mark: "+", text }))
  if (a.length === 0 || b.length === 0 || a.length * b.length > 4_000_000) return [...takenOut, ...putIn]
  const width = b.length + 1
  // How many lines a[i…] and b[j…] have in common, from the end.
  const common = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] =
        a[i] === b[j]
          ? common[(i + 1) * width + j + 1] + 1
          : Math.max(common[(i + 1) * width + j], common[i * width + j + 1])
    }
  }
  const result: Line[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ mark: " ", text: a[i++] })
      j++
    } else if (common[(i + 1) * width + j] >= common[i * width + j + 1]) result.push(takenOut[i++])
    else result.push(putIn[j++])
  }
  return [...result, ...takenOut.slice(i), ...putIn.slice(j)]
}

/** The changed lines in hunks, each with up to three kept lines around it, as `@@ -1,4 +1,5 @@` and its lines. */
function hunks(diff: Line[], context = 3): string[] {
  // Each line's number in the old file and the new one.
  const numbers: [number, number][] = []
  let old = 1
  let next = 1
  for (const line of diff) {
    numbers.push([old, next])
    if (line.mark !== "+") old++
    if (line.mark !== "-") next++
  }
  const output: string[] = []
  let at = 0
  while (at < diff.length) {
    if (diff[at].mark === " ") {
      at++
      continue
    }
    const from = Math.max(0, at - context)
    let last = at
    for (let scan = at + 1; scan < diff.length; scan++) {
      if (diff[scan].mark !== " ") last = scan
      else if (scan - last > context * 2) break
    }
    const to = Math.min(diff.length, last + context + 1)
    const shown = diff.slice(from, to)
    const [oldStart, newStart] = numbers[from]
    const oldCount = shown.filter((line) => line.mark !== "+").length
    const newCount = shown.filter((line) => line.mark !== "-").length
    output.push(`@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`)
    for (const line of shown) {
      output.push(`${line.mark}${line.text.replace(/\n$/, "")}`)
      if (!line.text.endsWith("\n")) output.push("\\ No newline at end of file")
    }
    at = to
  }
  return output
}

/** A hunk's range as git writes it: `4` for one line, `4,3` for three, `3,0` for none after line 3. */
function range(start: number, count: number): string {
  if (count === 0) return `${start - 1},0`
  return count === 1 ? `${start}` : `${start},${count}`
}
