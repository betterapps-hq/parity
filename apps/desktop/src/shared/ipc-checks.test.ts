import { codeEditors } from "@parity-app/processes"
import { describe, expect, it } from "vite-plus/test"
import {
  consoleAnnouncement,
  consoleOrigin,
  openInEditorRequest,
  problemReport,
  shownItem,
  themeSource
} from "./ipc-checks.ts"

const file = process.platform === "win32" ? "C:\\work\\app\\src\\Button.tsx" : "/work/app/src/Button.tsx"

describe("open-in-editor's request", () => {
  it("is a file's absolute path and an editor, and nothing more", () => {
    expect(openInEditorRequest.safeParse({ file, export: "Button", editor: "vscode" }).success).toBe(true)
    expect(openInEditorRequest.safeParse({ file: "--goto", editor: "vscode" }).success).toBe(false)
    expect(openInEditorRequest.safeParse({ file, editor: "notepad" }).success).toBe(false)
    expect(openInEditorRequest.safeParse({ file, editor: "zed", shell: true }).success).toBe(false)
    expect(openInEditorRequest.safeParse({ file, line: 0, editor: "zed" }).success).toBe(false)
  })

  it("takes the line an element's source gives", () => {
    expect(openInEditorRequest.safeParse({ file, line: 44, editor: "vscode" }).success).toBe(true)
  })

  it("takes every editor Settings lists", () => {
    for (const { id } of codeEditors) {
      expect(openInEditorRequest.safeParse({ file, editor: id }).success).toBe(true)
    }
  })
})

describe("the other arguments", () => {
  it("refuses a theme or path the window doesn't send", () => {
    expect(themeSource.safeParse("sepia").success).toBe(false)
    expect(shownItem.safeParse("relative/folder").success).toBe(false)
    expect(shownItem.safeParse(file).success).toBe(true)
  })

  it("takes a console announcement for a design at a level, and a builder's address (PAR-147)", () => {
    const pricing = { level: "warning", design: "app.par#pricing", state: "default", mode: "desktop" }
    expect(consoleAnnouncement.safeParse(pricing).success).toBe(true)
    expect(consoleAnnouncement.safeParse({ ...pricing, level: "log" }).success).toBe(false)
    expect(consoleAnnouncement.safeParse({ ...pricing, design: " " }).success).toBe(false)
    expect(consoleAnnouncement.safeParse({ ...pricing, text: "Picked" }).success).toBe(false)
    // Where the frame's code called the console.
    const call = { source: "http://127.0.0.1:5173/src/member-row.tsx", line: 9 }
    expect(consoleAnnouncement.safeParse({ ...pricing, ...call }).success).toBe(true)
    expect(consoleAnnouncement.safeParse({ ...pricing, ...call, line: -1 }).success).toBe(false)
    expect(consoleOrigin.safeParse("http://127.0.0.1:5173/").success).toBe(true)
    expect(consoleOrigin.safeParse("not an address").success).toBe(false)
  })

  it("takes a report linked to the Sentry event of the error a fallback caught (PAR-704)", () => {
    const report = { message: "Layers went blank", screenshot: true, afterCrash: false }
    const eventId = "0123456789abcdef0123456789abcdef"
    expect(problemReport.safeParse({ ...report, eventId }).success).toBe(true)
    expect(problemReport.safeParse({ ...report, eventId: eventId.toUpperCase() }).success).toBe(false)
    expect(problemReport.safeParse({ ...report, eventId: "fb1" }).success).toBe(false)
  })
})
