import { z } from "zod"

/** A whole number of milliseconds, described for the catalog as `meaning` says. */
export const ms = (meaning: string) => z.number().int().nonnegative().describe(meaning)
