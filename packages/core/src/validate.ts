// Small validators that report the JSON path of the first problem, so agents and people can fix files precisely.

export function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path || "/"}: expected an object`)
  }
  return value as Record<string, unknown>
}

export function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path}: expected a string`)
  return value
}

export function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${path}: expected a number`)
  return value
}

export function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path}: expected true or false`)
  return value
}

export function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path}: expected an array`)
  return value
}

export function expectOneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new TypeError(`${path}: expected one of ${options.map((option) => `"${option}"`).join(", ")}`)
  }
  return value as T
}

export function optional<T>(value: unknown, parse: (value: unknown) => T): T | undefined {
  return value === undefined ? undefined : parse(value)
}

/** Drops `undefined` entries, so parsed patches can be spread over defaults without erasing them. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

export function expectKnownKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TypeError(`${path}/${key}: unknown property`)
  }
}
