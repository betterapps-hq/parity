import { describe, expect, it } from "vite-plus/test"
import { correctDetection, parseCanvasDocument } from "./document.ts"

const toaster = { path: "src/components/ui/sonner.tsx", export: "Toaster" }
const price = { path: "src/promo.tsx", export: "PromoPrice" }

describe("correctDetection", () => {
  it("records each correction once", () => {
    const once = correctDetection(undefined, "exclude", toaster)
    expect(once).toEqual({ exclude: [toaster] })
    expect(correctDetection(once, "exclude", toaster)).toEqual({ exclude: [toaster] })
    expect(correctDetection(once, "include", price)).toEqual({ exclude: [toaster], include: [price] })
  })

  it("undoes a correction with its opposite, leaving nothing to write once none are left", () => {
    expect(correctDetection({ exclude: [toaster] }, "include", toaster)).toBeUndefined()
    expect(correctDetection({ include: [price], exclude: [toaster] }, "exclude", price)).toEqual({ exclude: [toaster] })
  })
})

describe("a project file's corrections", () => {
  it("are read with the designs, and checked", () => {
    const file = { version: 3, containers: [], detection: { include: [price] } }
    expect(parseCanvasDocument(file).detection).toEqual({ include: [price] })
    expect(() => parseCanvasDocument({ ...file, detection: { include: [{ path: "src/promo.tsx" }] } })).toThrow(
      "/detection/include/0/export"
    )
  })
})
