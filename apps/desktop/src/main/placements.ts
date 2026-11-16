import { found } from "@parity-app/connectors"
import { z } from "zod"
import { readItems, writeJson } from "./json-file.ts"

/** A result placed in a design: which one, where, by whom, when, and whether its source has been told. */
export const placement = z.strictObject({
  /** The result as the hub gave it, to tell its source again if the first try didn't reach it. */
  found,
  /**
   * The design it went into, as a key that holds no path: a hash of its project, file and id, so the same design is
   * counted once and an account's store never learns where projects are.
   */
  design: z.string().min(1),
  from: z.enum(["window", "agent"]),
  /** When, in milliseconds since the epoch. */
  at: z.number(),
  /** Whether the source took the report, for a source that asks for one. */
  told: z.boolean()
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
  /** Marks a placement's source as told. */
  told(placed: Placement): Promise<void>
  /** Placements whose source hasn't taken the report yet, to try again. */
  untold(): Promise<Placement[]>
}

/** How many placements the file keeps, newest first: enough to tell a placement again from a new one. */
const keptLimit = 2000

const same = (a: Placement, b: Placement) =>
  a.design === b.design && a.found.connector === b.found.connector && a.found.id === b.found.id

/**
 * Placements in a file in the app's data. Each change reads the file again first, so two copies of Parity sharing it
 * keep each other's. A file that can't be read starts again, so a placement may count twice rather than not at all,
 * which is the side a source's terms prefer.
 */
export function localPlacements(file: string): PlacementLog {
  // One change at a time in this copy, so two placements together both count.
  let writing: Promise<unknown> = Promise.resolve()

  const change = <T>(update: (placements: Placement[]) => { placements?: Placement[]; answer: T }): Promise<T> => {
    const changed = writing.then(async () => {
      const { placements, answer } = update(await readItems(file, "placements", placement))

      if (placements) {
        await writeJson(file, { placements: placements.slice(0, keptLimit) })
      }

      return answer
    })

    writing = changed.catch(() => undefined)

    return changed
  }

  return {
    add: (placed) =>
      change((placements) =>
        placements.some((each) => same(each, placed))
          ? { answer: false }
          : { placements: [placed, ...placements], answer: true }
      ),
    told: (placed) =>
      change((placements) => ({
        placements: placements.map((each) => (same(each, placed) ? { ...each, told: true } : each)),
        answer: undefined
      })),
    untold: async () => (await readItems(file, "placements", placement)).filter((each) => !each.told)
  }
}
