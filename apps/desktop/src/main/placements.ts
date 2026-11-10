import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { findKind } from "@parity-app/connectors"
import { z } from "zod"

/** A result placed in a design: which one, where, by whom and when. */
export const placement = z.strictObject({
  connector: z.string().min(1),
  /** The source's id for the result. */
  id: z.string().min(1),
  kind: findKind,
  /** The design it went into: its project's folder and the design's id, so the same design is counted once. */
  design: z.string().min(1),
  from: z.enum(["window", "agent"]),
  /** When, in milliseconds since the epoch. */
  at: z.number()
})

export type Placement = z.infer<typeof placement>

/**
 * Where placements are counted (PAR-829): Parity's usage of each source, which a source's terms or plan may limit. The
 * hub adds each placement before telling the source, and only a new one counts. This copy keeps them on this computer;
 * once Parity's service counts usage on the person's account, main passes the hub one that asks the service.
 */
export interface PlacementLog {
  /** Counts a placement, and says whether it's new: false when this result was already placed in this design. */
  add(placed: Placement): Promise<boolean>
}

/** How many placements the file keeps, newest first: enough to tell a placement again from a new one. */
const keptLimit = 2000

const placementsFile = z.object({ placements: z.array(z.unknown()) })

const same = (a: Placement, b: Placement) => a.design === b.design && a.connector === b.connector && a.id === b.id

/**
 * Placements in a file in the app's data. A file that can't be read starts again, so a placement may count twice
 * rather than not at all, which is the side a source's terms prefer.
 */
export function localPlacements(file: string): PlacementLog {
  let kept: Promise<Placement[]> | undefined
  // One change at a time, so two placements together both count.
  let writing: Promise<unknown> = Promise.resolve()

  const read = async (): Promise<Placement[]> => {
    try {
      const parsed = placementsFile.safeParse(JSON.parse(await readFile(file, "utf8")))

      return parsed.success ? parsed.data.placements.flatMap((each) => placement.safeParse(each).data ?? []) : []
    } catch {
      return []
    }
  }

  return {
    add(placed) {
      const added = writing.then(async () => {
        const placements = await (kept ??= read())

        if (placements.some((each) => same(each, placed))) {
          return false
        }

        const counted = [placed, ...placements].slice(0, keptLimit)
        kept = Promise.resolve(counted)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(`${file}.tmp`, JSON.stringify({ placements: counted }))
        await rename(`${file}.tmp`, file)

        return true
      })

      writing = added.catch(() => undefined)

      return added
    }
  }
}
