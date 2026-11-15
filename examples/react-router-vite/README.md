# React Router + TypeScript + Vite

An example app with React 19 and React Router in framework mode, on React Router's Vite plugin. Parity's React Router
extension is tested on it.

`app/routes.ts` declares the routes with each of React Router's conventions:

| Route                     | Convention                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `/`                       | An index route, in a layout without a path of its own           |
| `/:lang?/about`           | An optional segment                                             |
| `/projects/:projectId`    | A param, in a nested layout with its own path                   |
| `/settings/...`           | Flat routes from file names in `app/settings` (`flatRoutes`)    |
| `/docs/*`                 | `prefix`, and a splat                                           |
| `*`                       | A splat for every other URL                                     |

The flat routes in `app/settings` cover `_index`, `$param`, `($optional)`, a `_`-prefixed layout without a path, a
trailing `_` that escapes the parent layout, and a `$` splat.

```bash
pnpm dev
```
