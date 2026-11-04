import { describe, expect, it } from "vite-plus/test"
import { includeComponent, parseCanvasDocument } from "./document.ts"

const toaster = { path: "src/components/ui/sonner.tsx", export: "Toaster" }
const price = { path: "src/promo.tsx", export: "PromoPrice" }

describe("includeComponent", () => {
  it("lists each export once", () => {
    const once = includeComponent(undefined, price)
    expect(once).toEqual({ include: [price] })
    expect(includeComponent(once, price)).toEqual({ include: [price] })
    expect(includeComponent(once, toaster)).toEqual({ include: [price, toaster] })
  })
})

describe("a project file's corrections", () => {
  it("are read with the designs, and checked", () => {
    const file = { version: 3, containers: [], detection: { include: [price] } }
    expect(parseCanvasDocument(file).detection).toEqual({ include: [price] })
    // A list of components taken off by hand, as an earlier version saved, is dropped (PAR-531).
    expect(parseCanvasDocument({ ...file, detection: { include: [price], exclude: [toaster] } }).detection).toEqual({
      include: [price]
    })
    expect(() => parseCanvasDocument({ ...file, detection: { include: [{ path: "src/promo.tsx" }] } })).toThrow(
      "/detection/include/0/export"
    )
  })
})
