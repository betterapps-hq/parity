import { describe, expect, it, vi } from "vite-plus/test"
import { type Navigation, onPage, opensInBrowser, pageGuard } from "./parity-page.ts"

/** Parity's page in a development copy, and as an installed copy loads it. */
const devPage = "http://localhost:5310/"
const installedPage = "parity://app/index.html"

/** A main-frame navigation to `url`, which records whether it was refused. */
function navigation(url: string, { isMainFrame = true } = {}): Navigation & { refused: boolean } {
  return {
    url,
    isMainFrame,
    refused: false,
    preventDefault() {
      this.refused = true
    }
  }
}

describe("onPage", () => {
  it("is the same page with any query or hash, in development and installed", () => {
    expect(onPage(devPage, devPage)).toBe(true)
    expect(onPage(`${devPage}?tab=2#layers`, devPage)).toBe(true)
    expect(onPage(installedPage, installedPage)).toBe(true)
    expect(onPage(`${installedPage}?project=demo`, installedPage)).toBe(true)
  })

  it("isn't another path, port, host or scheme, or what isn't an address", () => {
    for (const url of [
      "http://localhost:5310/render.html",
      "http://localhost:5311/",
      "http://127.0.0.1:5310/",
      "https://localhost:5310/",
      "https://example.com/",
      "about:blank",
      "",
      "not an address"
    ]) {
      expect(onPage(url, devPage)).toBe(false)
    }

    expect(onPage("parity://app/render.html", installedPage)).toBe(false)
    expect(onPage("parity://other/index.html", installedPage)).toBe(false)
  })
})

describe("opensInBrowser", () => {
  it("takes web pages and dev servers on this machine", () => {
    for (const url of ["https://example.com/docs", "http://localhost:6006/", "http://127.0.0.1:6006/?path=/story/a"]) {
      expect(opensInBrowser(url)).toBe(true)
    }
  })

  it("leaves plain http elsewhere, files and the app's own schemes", () => {
    for (const url of [
      "http://example.com/",
      "http://localhost.example.com/",
      "file:///C:/Windows/System32/calc.exe",
      "parity://app/index.html",
      "javascript:alert(1)"
    ]) {
      expect(opensInBrowser(url)).toBe(false)
    }
  })
})

describe("pageGuard", () => {
  it("refuses a link off the editor's page, and opens it in the browser instead", () => {
    const openBrowser = vi.fn<(url: string) => void>()
    const guard = pageGuard({ page: devPage, openBrowser })
    const link = navigation("https://example.com/pricing")
    guard.navigate(link)
    expect(link.refused).toBe(true)
    expect(openBrowser).toHaveBeenCalledWith("https://example.com/pricing")
  })

  it("refuses an address the browser doesn't take without opening it", () => {
    const openBrowser = vi.fn<(url: string) => void>()
    const guard = pageGuard({ page: installedPage, openBrowser })

    for (const url of ["file:///C:/Users/me/evil.html", "parity://app/render.html", "http://example.com/"]) {
      const away = navigation(url)
      guard.navigate(away)
      expect(away.refused).toBe(true)
    }

    expect(openBrowser).not.toHaveBeenCalled()
  })

  it("lets a reload of the page through, with a new query or hash", () => {
    const openBrowser = vi.fn<(url: string) => void>()
    const guard = pageGuard({ page: devPage, openBrowser })

    for (const url of [devPage, `${devPage}?project=demo#layers`]) {
      const reload = navigation(url)
      guard.navigate(reload)
      guard.redirect(reload)
      expect(reload.refused).toBe(false)
    }

    expect(openBrowser).not.toHaveBeenCalled()
  })

  it("refuses a server's redirect off the page without opening it", () => {
    const openBrowser = vi.fn<(url: string) => void>()
    const redirect = navigation("https://example.com/")
    pageGuard({ page: devPage, openBrowser }).redirect(redirect)
    expect(redirect.refused).toBe(true)
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it("leaves frames inside the page alone", () => {
    const guard = pageGuard({ page: devPage, openBrowser: () => undefined })
    const embedded = navigation("https://www.youtube.com/embed/abc", { isMainFrame: false })
    guard.navigate(embedded)
    guard.redirect(embedded)
    expect(embedded.refused).toBe(false)
  })

  it("keeps a render window on its page, with nothing opened in the browser", () => {
    const guard = pageGuard({ page: new URL("render.html", devPage).href })
    const link = navigation("https://example.com/")
    guard.navigate(link)
    expect(link.refused).toBe(true)
    const editor = navigation(devPage)
    guard.navigate(editor)
    expect(editor.refused).toBe(true)
  })
})
