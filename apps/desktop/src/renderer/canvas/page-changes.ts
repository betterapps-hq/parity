import { type TokenPreview, tokenPreviewCss } from "@parity-app/frames"
import { useEffect } from "react"
import { resetWithWindow } from "../store.ts"

/*
 * What route boards hear besides their own pages (docs/proposals/route-frames.md, "Code changes and previews",
 * PAR-1264): the app's files that changed on disk, which the project service tells the window, batched, so copies whose
 * traces hold one are frozen again and pages that don't update themselves are started again; and token values edited and
 * not yet saved, the style preview every copy of the project's routes and their live pages show at once.
 */

type FilesListener = (paths: readonly string[]) => void

const filesListeners = new Map<string, Set<FilesListener>>()

/** The app's files that changed, relative to its root, as the project service says. */
export function pageFilesChanged(project: string, paths: readonly string[]): void {
  for (const listener of filesListeners.get(project) ?? []) {
    listener(paths)
  }
}

/** Hears the project's changed files until the returned function is called. */
export function onPageFiles(project: string, listener: FilesListener): () => void {
  const listeners = filesListeners.get(project) ?? new Set()
  listeners.add(listener)
  filesListeners.set(project, listeners)

  return () => {
    listeners.delete(listener)
  }
}

/** A project's previewed token values: the sheet every copy of its routes adopts, and the values and themes shown. */
interface TokensPreview {
  sheet: CSSStyleSheet
  tokens: readonly TokenPreview[]
  themes: readonly string[]
}

const tokenPreviews = new Map<string, TokensPreview>()

/** A project's live pages, each showing its previewed token values through what sends them over its channel. */
const livePages = new Map<string, Set<(css: string) => void>>()

resetWithWindow(() => {
  filesListeners.clear()
  tokenPreviews.clear()
  livePages.clear()
})

function tokensFor(project: string): TokensPreview {
  let preview = tokenPreviews.get(project)

  if (!preview) {
    preview = { sheet: new CSSStyleSheet(), tokens: [], themes: [] }
    tokenPreviews.set(project, preview)
  }

  return preview
}

/**
 * Shows token values edited and not yet saved in every copy of the project's routes and their live pages, in place of
 * what was shown: the page's own stylesheets hold the saved ones, which the design frames' shared stylesheet doesn't
 * reach. `themes` are the project's themes, whose own values a default value leaves alone. It goes into one sheet every
 * copy adopts, so it reaches them all in the same frame, and it never makes a copy stale. The same `tokens` and `themes`
 * as last time change nothing.
 */
export function previewTokens(project: string, tokens: readonly TokenPreview[], themes: readonly string[]): void {
  const preview = tokensFor(project)

  if (preview.tokens === tokens && preview.themes.join() === themes.join()) {
    return
  }

  preview.tokens = tokens
  preview.themes = themes
  preview.sheet.replaceSync(tokenPreviewCss(tokens, themes, "copy"))

  const css = tokenPreviewCss(tokens, themes, "page")

  for (const page of livePages.get(project) ?? []) {
    page(css)
  }
}

/** What the window's token store gives a preview: the values edited and not saved, and the tokens with their themes. */
interface PreviewedTokens {
  previews(): readonly TokenPreview[]
  get(): readonly { values: Record<string, string> }[]
  subscribe(listener: () => void): () => void
}

/**
 * Keeps the project's previewed token values (`previewTokens`) up to date with its token store while the component is
 * drawn. A route board's copy and the page drawn with the Interact tool each call it, so edits reach the page while no
 * copy is drawn; the same values twice change nothing.
 */
export function useTokenPreview(project: string, tokens: PreviewedTokens): void {
  useEffect(() => {
    const show = () => previewTokens(project, tokens.previews(), themesOf(tokens.get()))
    show()
    const unsubscribe = tokens.subscribe(show)

    return () => {
      unsubscribe()
    }
  }, [project, tokens])
}

/** Every theme the project's tokens have a value in, `default` included. */
function themesOf(tokens: readonly { values: Record<string, string> }[]): string[] {
  return [...new Set(tokens.flatMap((token) => Object.keys(token.values)))].sort((a, b) => a.localeCompare(b, "en"))
}

/** The sheet a copy of the project's routes adopts after its own, which holds its previewed token values. */
export function tokenPreviewSheet(project: string): CSSStyleSheet {
  return tokensFor(project).sheet
}

/**
 * Has a live page of the project show its previewed token values, now and whenever they change, through `show`, which
 * sends them over the page's channel (`preview.set`). Returns what stops it.
 */
export function showTokenPreview(project: string, show: (css: string) => void): () => void {
  const pages = livePages.get(project) ?? new Set()
  pages.add(show)
  livePages.set(project, pages)

  const preview = tokenPreviews.get(project)
  const css = preview ? tokenPreviewCss(preview.tokens, preview.themes, "page") : ""

  if (css !== "") {
    show(css)
  }

  return () => {
    pages.delete(show)
  }
}
