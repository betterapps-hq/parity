import type { LibraryDecorator } from "@parity-app/core"

/** A decorator of the builder's own, as the guest module lists it: the library it stands for, and the decorator. */
export interface BuilderDecorator {
  library: string
  decorator: LibraryDecorator
}

/*
 * Next's router on the canvas (PAR-1160). A component that reads Next's router, through `next/navigation`'s `useRouter`,
 * `usePathname`, `useSearchParams` or `useParams`, or the Pages Router's `next/router`, throws unless a router is
 * mounted around it, and the canvas draws components outside any of Next's pages. So the guest app has a module of its
 * own that mounts a still router around each frame: its navigation does nothing, and its path is the root's, with no
 * search params or route params, since a frame stands for no route of its own.
 */

/** The router module's file in the guest app, from its folder, beside the guest module. */
export const nextRouterFile = "app/parity-router.tsx"

/** How the guest module imports the router module: it's beside it, in the guest app's `app/` folder. */
export const nextRouterSpecifier = "./parity-router"

/** The decorator that wraps each frame in the still router, outermost, as the guest module lists it. */
export const nextRouterDecorator: BuilderDecorator = {
  library: "next",
  decorator: { wrap: { import: nextRouterSpecifier, component: "ParityNextRouter" } }
}

/**
 * The router module's source. It gives Next's own contexts, from the project's own Next, so the hooks the project's
 * components import read them: the App Router's router, path, search params and params, and the Pages Router's router.
 */
export const nextRouterSource = `// Written by Parity's Next.js builder each time it starts.
"use client"

import type { ReactNode } from "react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import {
  PathParamsContext,
  PathnameContext,
  SearchParamsContext
} from "next/dist/shared/lib/hooks-client-context.shared-runtime"
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime"

const nothing = () => {}
const done = async () => true

/** The App Router's router, whose navigation does nothing. */
const appRouter = {
  back: nothing,
  forward: nothing,
  refresh: nothing,
  hmrRefresh: nothing,
  push: nothing,
  replace: nothing,
  prefetch: nothing
}

/** The Pages Router's router, at the root and ready, whose navigation does nothing. */
const pagesRouter = {
  route: "/",
  pathname: "/",
  query: {},
  asPath: "/",
  basePath: "",
  isReady: true,
  isFallback: false,
  isPreview: false,
  isLocaleDomain: false,
  push: done,
  replace: done,
  reload: nothing,
  back: nothing,
  forward: nothing,
  prefetch: async () => {},
  beforePopState: nothing,
  events: { on: nothing, off: nothing, emit: nothing }
}

const searchParams = new URLSearchParams()
const params = {}

/** Next's routers around a frame, still, at the root. */
export function ParityNextRouter({ children }: { children?: ReactNode }) {
  return (
    <RouterContext.Provider value={pagesRouter as never}>
      <AppRouterContext.Provider value={appRouter as never}>
        <PathnameContext.Provider value="/">
          <SearchParamsContext.Provider value={searchParams as never}>
            <PathParamsContext.Provider value={params}>{children}</PathParamsContext.Provider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </RouterContext.Provider>
  )
}
`
