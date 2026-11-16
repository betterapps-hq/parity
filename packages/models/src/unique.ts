import type { z } from "zod"

/** Reports each item whose `id` an earlier item already has, at the later item's `id`. */
export function uniqueIds(
  items: readonly { id: string }[],
  path: PropertyKey[],
  context: z.RefinementCtx,
  seen = new Set<string>()
): void {
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({ code: "custom", path: [...path, index, "id"], message: `"${item.id}" is used twice` })
    }

    seen.add(item.id)
  })
}
