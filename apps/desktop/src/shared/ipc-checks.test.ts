import { codeEditors } from "@parity-app/core"
import { describe, expect, it, vi } from "vite-plus/test"
import {
  checked,
  consoleAnnouncement,
  consoleOrigin,
  openInEditorRequest,
  shownItem,
  themeSource
} from "./ipc-checks.ts"

const file = process.platform === "win32" ? "C:\\work\\app\\src\\Button.tsx" : "/work/app/src/Button.tsx"

describe("open-in-editor's request", () => {
  it("reaches its handler when it's a file and an editor", () => {
    const handler = vi.fn<(event: unknown, request: unknown) => string>(() => "opened")
    const request = { file, export: "Button", editor: "vscode" }
    expect(checked(openInEditorRequest, handler)({}, request)).toBe("opened")
    expect(handler).toHaveBeenCalledWith({}, request)
  })

  it("is refused before its handler when it isn't one", () => {
    const handler = vi.fn<() => void>()
    const open = checked(openInEditorRequest, handler)
    expect(() => open({}, { file: 42, editor: "vscode" })).toThrow(new TypeError("/file: expected a string"))
    expect(() => open({}, { file: "--goto", editor: "vscode" })).toThrow("/file: expected an absolute path")
    expect(() => open({}, { file, editor: "notepad" })).toThrow('/editor: expected one of "auto", "system", "vscode"')
    expect(() => open({}, { file, editor: "zed", shell: true })).toThrow("/shell: unknown property")
    expect(() => open({}, "open Button.tsx")).toThrow("/: expected an object")
    expect(() => open({}, { file, line: 0, editor: "zed" })).toThrow("/line")
    expect(handler).not.toHaveBeenCalled()
  })

  it("takes the line an element's source gives", () => {
    expect(openInEditorRequest.safeParse({ file, line: 44, editor: "vscode" }).success).toBe(true)
  })

  it("takes every editor Settings lists", () => {
    for (const { id } of codeEditors) expect(openInEditorRequest.safeParse({ file, editor: id }).success).toBe(true)
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
})
