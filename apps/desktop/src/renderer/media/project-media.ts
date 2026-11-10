import { type CodeReference, type ImageFile, type ProjectImage, projectImages } from "@parity-app/editor"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useContainerEntries } from "../design-store.ts"
import { reportError } from "../report-error.ts"
import { request } from "../service.ts"
import type { ProjectSession } from "../workspace.ts"

/*
 * A project's media as the window lists it (PAR-838). The service scans the image files and the code that names them
 * (`images.scan`); the window has the designs as they are, unsaved changes included; and `projectImages` in
 * `@parity-app/editor` puts the two together, the same way agents get them. The scan is kept for each open project,
 * so the tab shows what it last knew while it asks again.
 */

/** What the service last found in a project's files. */
interface Scanned {
  files: readonly ImageFile[]
  references: readonly CodeReference[]
}

interface FilesState {
  /** None until the first scan answers. */
  scanned?: Scanned
  /** The ones just added, by `src`, which arrive marked for a moment. */
  fresh: readonly string[]
}

/** How long one just added stays marked, in milliseconds. */
const freshFor = 1600

/** One open project's image files: the last scan, and what was just added. */
class MediaFiles {
  private state: FilesState = { fresh: [] }
  private readonly listeners = new Set<() => void>()
  private scanning: Promise<void> | undefined
  /** The paths designs named with no file there when a scan was last asked for. */
  private askedFor: string | undefined

  constructor(private readonly projectId: string) {}

  get = (): FilesState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /** Whether a scan has been asked for since designs last named these paths without a file. */
  askedAbout(missing: string): boolean {
    return this.askedFor === missing
  }

  /** Asks the service again. A scan already under way answers for this one too. */
  scan(missing = this.askedFor): Promise<void> {
    this.askedFor = missing
    this.scanning ??= this.ask().finally(() => {
      this.scanning = undefined
    })

    return this.scanning
  }

  /** Marks the ones just added for a moment, as they arrive on the wall. */
  markFresh(srcs: readonly string[]): void {
    this.set({ ...this.state, fresh: srcs })
    setTimeout(
      () => this.set({ ...this.state, fresh: this.state.fresh.filter((src) => !srcs.includes(src)) }),
      freshFor
    )
  }

  private async ask(): Promise<void> {
    try {
      this.set({ ...this.state, scanned: await request("images.scan", { projectId: this.projectId }) })
    } catch (error) {
      reportError(error, { operation: "images.scan", title: "Couldn't list the project's media" })
      // What it last knew stays; with nothing known, the tab shows none rather than waiting forever.
      this.set({ ...this.state, scanned: this.state.scanned ?? { files: [], references: [] } })
    }
  }

  private set(state: FilesState): void {
    this.state = state

    for (const listener of this.listeners) {
      listener()
    }
  }
}

const byProject = new WeakMap<ProjectSession, MediaFiles>()

/** An open project's image files, made the first time they're asked for. */
export function mediaFilesOf(session: ProjectSession): MediaFiles {
  let files = byProject.get(session)

  if (!files) {
    files = new MediaFiles(session.id)
    byProject.set(session, files)
  }

  return files
}

/** A project's media for the tab. */
export interface ProjectMedia {
  images: readonly ProjectImage[]
  /** Before the first scan answers. */
  loading: boolean
  fresh: readonly string[]
}

/**
 * The project's media, following its designs as they change. It scans as the tab opens, and again when a design names
 * an image file the last scan didn't have, as one pasted or dropped onto the canvas meanwhile.
 */
export function useProjectMedia(session: ProjectSession): ProjectMedia {
  const files = mediaFilesOf(session)
  const { scanned, fresh } = useSyncExternalStore(files.subscribe, files.get)
  const entries = useContainerEntries(session.store)

  const images = useMemo(
    () => (scanned ? projectImages({ ...scanned, documents: session.store.getDocuments() }) : []),
    // The documents are the store's own, read as the designs change, which `entries` says.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [scanned, entries, session.store]
  )

  useEffect(() => {
    void files.scan()
  }, [files])

  const missing = images.flatMap((image) => (image.kind === "missing" ? [image.src] : [])).join("\n")

  useEffect(() => {
    if (!files.askedAbout(missing)) {
      void files.scan(missing)
    }
  }, [files, missing])

  return { images, loading: !scanned, fresh }
}
