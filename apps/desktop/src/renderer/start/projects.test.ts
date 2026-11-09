import { describe, expect, it } from "vite-plus/test"
import { folderName, inScope, knownProjects, projectHue, whenLabel } from "./projects.ts"

// docs/editor.md, The start page: what Home and a new tab list, and how they say when a project last opened (PAR-605).

describe("knownProjects", () => {
  it("lists the recent ones in order, then starred ones that aren't recent, last opened first", () => {
    const projects = knownProjects(["/apps/site", "/apps/shop"], {
      "/apps/shop": { opened: 30, starred: true },
      "/apps/old": { opened: 10, starred: true },
      "/apps/older": { opened: 5, starred: true },
      "/apps/newer": { opened: 20, starred: true }
    })

    expect(projects.map(({ root, recent, starred }) => ({ root, recent, starred }))).toEqual([
      { root: "/apps/site", recent: true, starred: false },
      { root: "/apps/shop", recent: true, starred: true },
      { root: "/apps/newer", recent: false, starred: true },
      { root: "/apps/old", recent: false, starred: true },
      { root: "/apps/older", recent: false, starred: true }
    ])
  })

  it("names each by its folder, and knows when it opened only when that was kept", () => {
    const [site, shop] = knownProjects(["C:\\apps\\site", "/apps/shop/"], { "/apps/shop/": { opened: 42 } })
    expect(site).toEqual({ root: "C:\\apps\\site", name: "site", starred: false, recent: true })
    expect(shop).toMatchObject({ name: "shop", opened: 42 })
  })

  it("flags the ones whose folders weren't there when last checked (PAR-188)", () => {
    const projects = knownProjects(
      ["/apps/site", "/apps/gone"],
      { "/apps/old": { starred: true } },
      new Set(["/apps/gone", "/apps/old"])
    )

    expect(projects.map(({ root, missing }) => ({ root, missing }))).toEqual([
      { root: "/apps/site", missing: undefined },
      { root: "/apps/gone", missing: true },
      { root: "/apps/old", missing: true }
    ])
  })
})

describe("inScope", () => {
  const projects = knownProjects(["/a", "/b"], { "/b": { starred: true }, "/c": { starred: true } })

  const roots = (scope: Parameters<typeof inScope>[1], skip?: string) =>
    inScope(projects, scope, skip).map(({ root }) => root)

  it("lists the recent ones under Recent, leaving out the one Home offers to continue", () => {
    expect(roots("recent")).toEqual(["/a", "/b"])
    expect(roots("recent", "/a")).toEqual(["/b"])
  })

  it("lists starred ones under Starred, every one under All projects, and none as shared yet", () => {
    expect(roots("starred")).toEqual(["/b", "/c"])
    expect(roots("all", "/a")).toEqual(["/a", "/b", "/c"])
    expect(roots("shared")).toEqual([])
  })
})

describe("whenLabel", () => {
  const now = new Date(2026, 10, 5, 15, 0).getTime()
  const at = (...parts: [number, number, number, number?, number?]) => whenLabel(new Date(...parts).getTime(), now)

  it("counts minutes, then hours, within the day", () => {
    expect(whenLabel(now - 20_000, now)).toBe("just now")
    expect(whenLabel(now - 60_000, now)).toBe("1 minute ago")
    expect(whenLabel(now - 12 * 60_000, now)).toBe("12 minutes ago")
    expect(at(2026, 10, 5, 14, 0)).toBe("1 hour ago")
    expect(at(2026, 10, 5, 0, 30)).toBe("14 hours ago")
  })

  it("gives yesterday's time, then the weekday, then the date, with the year when it isn't this one", () => {
    expect(at(2026, 10, 4, 18, 40)).toBe("yesterday at 6:40 PM")
    expect(at(2026, 10, 2, 9, 0)).toBe("on Monday")
    expect(at(2026, 9, 3, 9, 0)).toBe("on October 3")
    expect(at(2025, 9, 3, 9, 0)).toBe("on October 3, 2025")
  })
})

describe("projectHue", () => {
  it("gives the same folder the same hue, and different folders different ones", () => {
    expect(projectHue("/apps/site")).toBe(projectHue("/apps/site"))
    expect(projectHue("/apps/site")).not.toBe(projectHue("/apps/shop"))
    expect(projectHue("/apps/site")).toBeGreaterThanOrEqual(0)
    expect(projectHue("/apps/site")).toBeLessThan(360)
  })
})

describe("folderName", () => {
  it("takes the last part of a path on Windows or anywhere else", () => {
    expect(folderName("D:\\canvas\\fixtures\\chakra")).toBe("chakra")
    expect(folderName("/apps/site/")).toBe("site")
  })
})
