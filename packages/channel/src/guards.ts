/**
 * Whether a value that arrived is an object, whose fields can then be read one by one. The preload script bundles this
 * package and checks what arrives without zod.
 */
export function isObject(value: unknown): value is object {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- telling an object from a primitive, with no zod to parse it
  return typeof value === "object" && value !== null
}
