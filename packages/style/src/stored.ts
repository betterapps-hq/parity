import { z } from "zod"

/** A number other than NaN or ±Infinity, which zod 4 refuses on its own. */
export const finiteNumber = z.number()

/** Zod's own copy of an object, without the keys whose values are `undefined`, as JSON leaves them out. */
function withoutUnset<T extends object>(value: T): T {
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      Reflect.deleteProperty(value, key)
    }
  }

  return value
}

/**
 * An object in the stored style. A key it doesn't know is an error, and a key set to `undefined` is left out, as core's
 * `fileObject` does for every object in a file Parity owns.
 */
export function stored<const Fields extends NonNullable<Parameters<typeof z.strictObject>[0]>>(fields: Fields) {
  return z.strictObject(fields).overwrite(withoutUnset)
}
