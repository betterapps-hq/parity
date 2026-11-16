import { describe, expect, it } from "vite-plus/test"
import { readGuestPage } from "./page.ts"

const origin = "http://127.0.0.1:53306"
const guestId = "[project]/app/.next/parity/app/guest.tsx [app-client] (ecmascript)"
const shared = `${origin}/_next/static/chunks/next_dist_1d6ci._.js`
const own = `${origin}/_next/static/chunks/app_guest_tsx_0iffi._.js`

/** A page as Next renders it: its tags, then its payload pushed to `self.__next_f` a string at a time. */
function page(rows: string[]): string {
  const pushes = rows.map((row) => `<script>self.__next_f.push([1,${JSON.stringify(`${row}\n`)}])</script>`)

  return [
    "<!DOCTYPE html><html><head>",
    `<link rel="stylesheet" href="${origin}/_next/static/chunks/app_globals_css.css?v=1&amp;b=2" data-precedence="next"/>`,
    `<script src="${origin}/_next/static/chunks/turbopack-app_0tdedvg50k._.js" async=""></script>`,
    `<script src="${shared}" async=""></script>`,
    "</head><body>",
    ...pushes,
    "</body></html>"
  ].join("")
}

describe("reading the guest app's pages", () => {
  it("finds their scripts and stylesheets, in order", () => {
    const read = readGuestPage(page([]))

    expect(read.scripts).toEqual([`${origin}/_next/static/chunks/turbopack-app_0tdedvg50k._.js`, shared])
    expect(read.stylesheets).toEqual([`${origin}/_next/static/chunks/app_globals_css.css?v=1&b=2`])
    expect(read.guest).toBeUndefined()
  })

  it("finds the guest module's id and chunks in the client reference that names it", () => {
    const read = readGuestPage(page([`3e:I[${JSON.stringify(guestId)},${JSON.stringify([shared, own])},"default"]`]))

    expect(read.guest).toEqual({ id: guestId, chunks: [shared, own] })
  })

  it("follows the rows Next.js 16.4 writes repeated strings to", () => {
    const read = readGuestPage(
      page([
        `8:${JSON.stringify(shared)}`,
        `9:I["$7",["$8"],"SegmentViewNode"]`,
        `3b:${JSON.stringify(guestId)}`,
        `3d:${JSON.stringify(own)}`,
        `3e:I["$3b",["$8","$3d"],"default"]`
      ])
    )

    expect(read.guest).toEqual({ id: guestId, chunks: [shared, own] })
  })

  it("finds another of the guest app's client modules by its file, as a module's own page names it", () => {
    const moduleId = "[project]/app/.next/parity/app/parity-modules/src-Card-1a2b3c4d.tsx [app-client] (ecmascript)"
    const html = page([`5:I[${JSON.stringify(moduleId)},${JSON.stringify([shared, own])},"default"]`])

    expect(readGuestPage(html).guest).toBeUndefined()
    expect(readGuestPage(html, "app/parity-modules/src-Card-1a2b3c4d.tsx").guest).toEqual({
      id: moduleId,
      chunks: [shared, own]
    })
  })
})
