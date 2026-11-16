import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"

/** The root of every route: the document each page is drawn in. Server routes, such as the API's, don't use it. */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Parity" }
    ]
  }),
  component: RootDocument
})

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
