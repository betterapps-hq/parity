import { addDesigns, type CanvasDocument } from "@parity-app/core"
import { routeScreens } from "@parity-app/editor"
import type { ProjectInfo } from "@parity-app/project"

/**
 * Where the app's pages are kept among a project's designs (PAR-1076): a design file of their own that's never saved,
 * since they're drawn from the routes each time the project opens.
 */
export const routePagesFile = "(pages)"

/** Each open project's page screens, by design id, with the URL their frames draw. */
const pageUrls = new Map<string, ReadonlyMap<string, string>>()

/**
 * The app's pages as a design file, above the project's own designs, or none without routes. Remembers each page's URL
 * for its frames to draw.
 */
export function routePages(info: Pick<ProjectInfo, "id" | "routes" | "guestUrl" | "documents" | "modes">): {
  path: string
  document: CanvasDocument
}[] {
  const ys = info.documents.flatMap((entry) => entry.document.containers.map((container) => container.position.y))

  const screens = routeScreens(info.routes, info.modes.settings, {
    origin: new URL(info.guestUrl).origin,
    x: 0,
    bottom: Math.min(0, ...ys) - 400,
    width: 1280,
    height: 800,
    gap: 160,
    rowGap: 400
  })

  pageUrls.set(info.id, new Map(screens.map(({ screen, url }) => [screen.id, url])))

  return screens.length === 0
    ? []
    : [
        {
          path: routePagesFile,
          document: addDesigns(
            undefined,
            screens.map(({ screen }) => screen)
          )
        }
      ]
}

/** The URL a page screen's frames draw, or undefined for a design. */
export function routePageUrl(project: string, design: string): string | undefined {
  return pageUrls.get(project)?.get(design)
}
