import { z } from "zod"
import { modelParser } from "./check.ts"
import { uniqueIds } from "./unique.ts"

// The routes lens's model. No standard describes an app's routes, so this is Parity's: a tree of routes, each with its
// path as a WHATWG URL pattern and the file that draws it.

export const Route = z
  .strictObject({
    /** Unique within the whole tree. */
    id: z.string().min(1),
    /** The full path as a WHATWG URL pattern's pathname, such as `/users/:id`. */
    path: z.string().startsWith("/"),
    /** The project file that draws it, relative to the project. Unset for a route a person linked by hand. */
    file: z.string().optional(),
    /** Whether it draws a layout around its children. */
    layout: z.boolean().optional(),
    get children(): z.ZodOptional<z.ZodArray<typeof Route>> {
      return z.array(Route).optional()
    }
  })
  .meta({ id: "Route" })

export const Routes = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    routes: z.array(Route)
  })
  .superRefine((model, context) => {
    const seen = new Set<string>()

    const visit = (routes: readonly Route[], path: PropertyKey[]) => {
      uniqueIds(routes, path, context, seen)
      routes.forEach((route, index) => {
        if (route.children) {
          visit(route.children, [...path, index, "children"])
        }
      })
    }

    visit(model.routes, ["routes"])
  })

export type Route = z.infer<typeof Route>

export type Routes = z.infer<typeof Routes>

export const parseRoutes = modelParser(Routes)
