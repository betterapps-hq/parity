import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { isText } from "@parity-app/core/values/evaluate"
import {
  diffFile,
  type FileChange,
  type FileContent,
  type FileEdit,
  insideProject,
  planEdit,
  type ProjectEdit,
  reverseEdit
} from "@parity-app/project"
import type { ProjectEditResult } from "../shared/protocol.ts"
import { removeProjectFile, writeProjectFile } from "./project-files.ts"

/** What an edit needs of an open project: where it is, and what its files last held as the service wrote them. */
export interface EditedProject {
  info: { id: string; root: string }
  known: Map<string, string>
}

/** How many of a project's latest edits can be undone, and how much of their files is kept to undo them, in bytes. */
const kept = { edits: 50, bytes: 64 * 1024 * 1024 }

/**
 * The edits applied to each project, oldest first, to undo by id. They outlast the project closing, since the window
 * reopens a project to pick up what an edit changed; undoing checks the files first either way.
 */
const history = new Map<string, { id: string; label: string; changes: FileChange[] }[]>()

/**
 * Each project's edits and saves run one at a time, so one never plans from files another is partway through writing,
 * and two saves of a file land in the order they were made.
 */
const queues = new Map<string, Promise<unknown>>()

export function queued<T>(project: EditedProject, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(project.info.id) ?? Promise.resolve()).then(task, task)
  queues.set(
    project.info.id,
    run.catch(() => undefined)
  )

  return run
}

/**
 * Every write the service makes into a project goes through here. It reads what each file holds now and checks that's
 * what the edit expects, then writes them all, putting back the ones already written if a write fails. What it writes is
 * recorded, so the watcher takes the change as the service's own.
 */
export function applyProjectEdit(project: EditedProject, edit: ProjectEdit): Promise<ProjectEditResult> {
  return queued(project, async () => {
    const changes = await apply(project, edit)
    const id = randomUUID()
    const applied = [...(history.get(project.info.id) ?? []), { id, label: edit.label, changes }].slice(-kept.edits)

    while (applied.length > 1 && applied.reduce((total, entry) => total + size(entry.changes), 0) > kept.bytes) {
      applied.shift()
    }

    history.set(project.info.id, applied)

    return result(id, edit.label, changes)
  })
}

/** Takes back one of the project's edits, as long as its files still hold what it wrote. */
export function undoProjectEdit(project: EditedProject, id: string): Promise<ProjectEditResult> {
  return queued(project, async () => {
    const applied = history.get(project.info.id) ?? []
    const entry = applied.find((candidate) => candidate.id === id)

    if (!entry) {
      throw new Error("That change is too old to undo, or was undone already")
    }

    const label = `Undo ${entry.label.charAt(0).toLowerCase()}${entry.label.slice(1)}`
    const changes = await apply(project, reverseEdit(label, entry.changes))
    history.set(
      project.info.id,
      applied.filter((candidate) => candidate !== entry)
    )

    return result(id, label, changes)
  })
}

function size(changes: FileChange[]): number {
  return changes.reduce((total, { before, after }) => total + (before?.length ?? 0) + (after?.length ?? 0), 0)
}

async function apply(project: EditedProject, edit: ProjectEdit): Promise<FileChange[]> {
  const { root } = project.info
  const current = new Map<string, FileContent | undefined>()

  for (const file of edit.files) {
    if (current.has(file.path)) {
      continue
    }

    const target = insideProject(root, file.path)

    if (!target) {
      throw new Error(`${file.path} is outside the project`)
    }

    if (!existsSync(target)) {
      current.set(file.path, undefined)
    } else {
      current.set(file.path, isTextEdit(file) ? await readFile(target, "utf8") : new Uint8Array(await readFile(target)))
    }
  }

  const changes = planEdit(edit, current)
  // Each file is written whole or not at all, so only those that landed are put back, with what the watcher knew.
  const written: { change: FileChange; known: string | undefined }[] = []

  try {
    for (const change of changes) {
      const known = project.known.get(change.path)
      await write(root, change.path, change.after)
      written.push({ change, known })

      if (isText(change.after)) {
        project.known.set(change.path, change.after)
      }
    }
  } catch (error) {
    for (const { change, known } of written.reverse()) {
      await write(root, change.path, change.before).catch(() => undefined)

      if (known === undefined) {
        project.known.delete(change.path)
      } else {
        project.known.set(change.path, known)
      }
    }

    throw error
  }

  return changes
}

function isTextEdit(file: FileEdit): boolean {
  if (file.kind === "patch") {
    return true
  }

  return isText(file.kind === "delete" ? file.expected : file.content)
}

async function write(root: string, path: string, content: FileContent | undefined): Promise<void> {
  await (content === undefined ? removeProjectFile(root, path) : writeProjectFile(root, path, content))
}

function result(id: string, label: string, changes: FileChange[]): ProjectEditResult {
  return { id, label, files: changes.map((change) => ({ path: change.path, diff: diffFile(change) })) }
}
