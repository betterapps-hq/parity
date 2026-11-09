import type { z } from "zod"

/**
 * Checks a value against a model's schema and returns it typed. A failure throws `TypeError` with the JSON pointer of
 * the first problem, as `/tables/0/name: expected a string`, the way `.par` and `.lib.par` files report theirs.
 */
export function checkModel<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)

  if (result.success) {
    return result.data
  }

  throw new TypeError(describeIssue(result.error.issues[0]!))
}

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return `${pointer([...issue.path, issue.keys[0]!])}: unknown property`
  }

  // A record key that fails its own check says why in its nested issue.
  if (issue.code === "invalid_key") {
    return `${pointer(issue.path)}: ${issue.issues[0]?.message ?? issue.message}`
  }

  return `${pointer(issue.path) || "/"}: ${issue.message}`
}

function pointer(path: readonly PropertyKey[]): string {
  return path.map((key) => `/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("")
}
