import { describe, expect, it } from "vite-plus/test"
import { changeProjects, projectsChange, readProjects, recentLimit } from "./projects-file.ts"

describe("projects.json", () => {
  it("lists nothing when there's no file", () => {
    expect(readProjects(undefined)).toEqual({ values: { recent: [], notes: {} } })
  })

  it("drops entries that don't read without losing the rest", () => {
    const text = JSON.stringify({ recent: ["D:/shop", 3, ""], notes: { "D:/shop": { opened: "soon", starred: true } } })

    expect(readProjects(text).values).toEqual({ recent: ["D:/shop"], notes: { "D:/shop": { starred: true } } })
  })

  it("says why a file that isn't JSON couldn't be read", () => {
    expect(readProjects("{ recent").problem).toMatch(/^projects.json isn't JSON/)
  })

  it("puts a project that opened at the top, with when, and keeps the list to its limit", () => {
    const full = JSON.stringify({ recent: Array.from({ length: recentLimit }, (_, index) => `D:/${index}`) })
    const after = readProjects(changeProjects(full, { kind: "opened", root: "D:/shop" }, 5)).values

    expect(after.recent).toHaveLength(recentLimit)
    expect(after.recent[0]).toBe("D:/shop")
    expect(after.notes["D:/shop"]).toEqual({ opened: 5 })
  })

  it("keeps a starred project's star when it comes off the recent list, and forgets an unstarred one's notes", () => {
    let text = changeProjects(undefined, { kind: "opened", root: "D:/shop" }, 1)
    text = changeProjects(text, { kind: "opened", root: "D:/blog" }, 2)
    text = changeProjects(text, { kind: "starred", root: "D:/shop", starred: true }, 3)
    text = changeProjects(text, { kind: "forgot" }, 4)

    expect(readProjects(text).values).toEqual({ recent: [], notes: { "D:/shop": { opened: 1, starred: true } } })
  })

  it("keeps keys it doesn't know, and refuses to write over text that doesn't parse", () => {
    expect(JSON.parse(changeProjects(JSON.stringify({ newer: 1 }), { kind: "forgot" }, 0))).toMatchObject({ newer: 1 })
    expect(() => changeProjects("{ half", { kind: "forgot" }, 0)).toThrow(/isn't JSON/)
  })

  it("refuses a change from a window that isn't one", () => {
    expect(projectsChange.safeParse({ kind: "starred", root: "D:/shop", starred: true }).success).toBe(true)
    expect(projectsChange.safeParse({ kind: "opened", root: "" }).success).toBe(false)
    expect(projectsChange.safeParse({ kind: "opened", root: "D:/shop", at: 1 }).success).toBe(false)
  })
})
