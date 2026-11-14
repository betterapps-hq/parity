import { describe, expect, it } from "vite-plus/test"
import { tailwindStyles } from "./index.ts"

describe("tailwindStyles.status", () => {
  it("shows Tailwind CSS with its logo and version, and opens the tokens", () => {
    const [item] = tailwindStyles.status?.({ version: "4.1.18", packageManager: "pnpm" }) ?? []

    expect(item).toMatchObject({ value: "Tailwind CSS", hint: "Tailwind CSS 4.1.18", opens: { tab: "tokens" } })
    expect(item?.icon).toBeUndefined()
    expect(tailwindStyles.icon?.path).toBeTruthy()
  })
})
