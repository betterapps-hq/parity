# Proposal: Parity's service, starting with stock media search

Status: draft for discussion, 2026-11-11 (PAR-131). Nothing here is built. It says where Parity's server code runs, how
it grows, and what its first route does. Calls already made are in
[decisions.md](../decisions.md#keys-are-the-app-owners-and-parity-reports-uses-itself-par-829); the connectors it serves
are in [connectors.md](../connectors.md).

## In one line

One TanStack Start app, `apps/portal`, runs on a Cloudflare Worker. It ships first with no pages, only an API under
`/api/v1`, and its first route runs stock media searches with Parity's keys. The portal's screens, and every later API,
join the same app until a piece has a reason to leave it.

## Why now

An installed copy of Parity can't search Pixabay or Mobbin: the keys are the app owner's, a shipped copy carries none,
and every search ends in `no-key`. Main already has the slot for a service that holds them (`SearchService` in
`apps/desktop/src/main/connectors.ts`). Nothing fills it.

## Where it runs

- **Cloudflare Workers.** A Worker has no servers to size and no general limit on requests a second. Each request gets
  128 MB of memory and 30 seconds of CPU, which can be raised to 5 minutes. 100,000 people is a small load for it.
- **TanStack Start,** the tech stack's choice for full-stack apps and the portal's (your call, 2026-11-11). Version 1.0
  came out on 2026-10-13, and Cloudflare supports it through `@cloudflare/vite-plugin`.
- **A route with no page is a server route:** a route file with `server.handlers` and no component. So the app can ship
  with only an API. Whether an app with no pages at all builds cleanly is the first thing to try.
- **Bindings and secrets come from `cloudflare:workers`** (`import { env }`), and Terraform sets them, in
  `infra/cloudflare` beside Storybook's previews.

## How it grows

You asked for a system that stays simple and can still serve 100,000 people, cloud projects, Better Apps' features and
webhooks. The rule: one Worker, and a new piece only when something needs it.

| Need                                   | Piece                                         | When                        |
| -------------------------------------- | --------------------------------------------- | --------------------------- |
| The API and the portal's pages         | The one Worker, `apps/portal`                 | Now                         |
| A shared cache of searches             | Workers KV                                    | Now                         |
| Accounts, comments, approvals, history | Neon Postgres, reached through Hyperdrive     | With the first such feature |
| Projects, designs and media in cloud   | R2                                            | With cloud projects         |
| Webhooks and other work after a reply  | Queues, with a consumer Worker                | With webhooks               |
| Presence and live editing              | Durable Objects, one for each project         | With the first live feature |
| Rendering, video and other heavy work  | A queue's consumer, a Workflow or a container | When a feature needs it     |

- **The database is the limit to plan for, not the Worker.** Postgres lives in one region. Hyperdrive pools the
  connections and caches reads, and a placement hint runs the Worker near the database.
- **Every row names its organization from the first table,** so the same features can serve many apps once Better Apps
  is hosted.
- **A Durable Object handles about 1,000 requests a second,** so anything live is split by project, never one object for
  everyone.
- **A piece leaves the Worker only for a reason:** it scales differently, releases on its own schedule, or mustn't share
  the Worker's secrets. Workers call each other through service bindings, with no public address and no extra request
  fee, so leaving is cheap.
- **Features are called through an interface.** Today the code behind one runs in the Worker, from Better Apps'
  packages. Once Better Apps is hosted, the same interface is an HTTP client to it, and Parity's routes don't change.

## The search API

It is the hub's `SearchService` over HTTP, in the shapes `@parity-app/connectors` already checks.

| Route                                 | Takes             | Gives                                  |
| ------------------------------------- | ----------------- | -------------------------------------- |
| `GET /api/v1/connectors`              | Nothing           | The ids of the connectors it searches  |
| `POST /api/v1/connectors/{id}/search` | A `SearchRequest` | A `SearchAnswer`: results or a problem |

- **The service runs the same adapters as the app,** with `checkRequest` first, so an answer is the same whether main or
  the service ran the search.
- **A problem is still an answer.** A search the source refused comes back as `{ problem }` with status 200. The
  service's own refusals use the same body with a matching status: 400 for `invalid`, 429 with `Retry-After` for
  `rate-limited`, and 503 for `unavailable`. `no-key` and `key-refused` reach the app as `unavailable`, since only the
  owner can fix them, and the service reports them to Sentry.
- **Pictures and videos still load straight from the source.** The service passes on links and never the files.
- **`placed` has no route yet.** Neither offered connector has one. Unsplash's would be
  `POST /api/v1/connectors/{id}/placed`, added if it's offered again.
- **`v1` is in the path** so an old installed copy keeps working when the API changes.

## The cache

- **Each answer is kept for 24 hours and shared by everyone,** as Pixabay's terms ask. The key is a hash of the
  connector's id and the request as checked, with defaults filled in, so two people asking the same thing share one.
- **It's kept in Workers KV.** KV is the same everywhere within about a minute, which suits a cache. The Workers Cache
  API was passed over: what it keeps stays in one data centre, so each would ask Pixabay again.
- **Only what was found is kept,** never a problem, and without `allowance`, which is true only for the search that
  asked the source.
- **A kept answer's picture links may be near their end.** Pixabay's links last 24 hours from the search. Results are
  shown at once and placing saves the file, so a link that fails shows as a picture that didn't load. If that's seen,
  keep answers for less than a day and ask Pixabay whether that's allowed.

## Limits

- **Pixabay allows 100 requests a minute for the key, shared by every user,** so the cache carries most of the load. The
  service reads `X-RateLimit-Remaining` and answers `rate-limited` itself before the source would. Pixabay raises the
  limit for apps that use its API well, and the app's owner asks once there's use to show.
- **Each install is limited, and each address,** with the Workers rate limiting binding. The app sends its install id,
  which telemetry already has. The binding counts in each Cloudflare location over 10 or 60 seconds and isn't exact,
  which is enough to stop a loop. The numbers are set once there's real use: to start, 30 a minute for an install and 60
  for an address.
- **An install id can be made up,** which is why the address is limited too. If that isn't enough, searching can ask for
  a signed-in person (below).

## Who can call it

- **Anyone, with no sign-in** (my recommendation; your call). Signing in is optional, and stock pictures shouldn't be
  the first thing that asks for it.
- **A signed-in copy sends its access token as well, later.** Better Apps' WorkOS identity already reads it (PAR-615).
  That's how routes for organizations (PAR-616) will know who's asking, and it could give signed-in people more
  searches.

## Personal data

The service keeps none. The install id and the address are only keys to a counter that expires in a minute. What was
searched is kept only as the hash in the cache's key, beside the source's answer. Logs and Sentry get the connector, the
kind, the filters, how it ended and how long it took, as `connectors.searched` does, and never the query.

## Mobbin

**Pixabay first** (my recommendation; your call). The API takes any connector, so adding Mobbin is one line and a
secret. Mobbin's key belongs to a paid Team plan, and its terms need reading before every user's searches go through it.
Until then Mobbin searches only in a development copy.

## Where the code goes

As [packages.md](packages.md) sets out, logic takes data and returns data:

- **`@parity-app/service`, a new package:** the route's logic. It takes a request, the keys, a cache, a limiter and
  `fetch`, and returns a status and a body. Its tests run with stand-ins, without a Worker.
- **`apps/portal`:** the TanStack Start app. Each route file reads the bindings and calls the package.
- **`apps/desktop`:** a `SearchService` in main that calls the routes, used for a connector with no key here. A key in
  the environment still wins, so development copies don't change. The window already shows a key's source as `service`.
- **`infra/cloudflare`:** the Worker, its KV namespace, its rate limits, its secrets and its domain.

**New dependencies, which need your agreement:** `@tanstack/react-start`, `@cloudflare/vite-plugin` and `wrangler`.
TanStack Start 1.0 is reported to need Vite 8; that's checked against this repository's `vp` before anything is added.

## Still to check

- An app with no pages builds and deploys.
- The Worker's size limit. Cloudflare's limits page was read as 64 MiB before compression, which is far more than this
  needs, but the figure wasn't confirmed.
- Whether the rate limiting binding costs anything. Its page doesn't say.
- Mobbin's API terms.

## Decisions needed from you

1. **Who can call it:** anyone, limited by install and address (recommended), or signed-in people only.
2. **Mobbin:** after a check of its terms (recommended), from the start, or not at all.
3. **The domain** the portal and its API live on. Installed copies will call it for as long as they're in use.
4. **The three new dependencies** above.

## The work, once this is agreed

Each is its own issue and pull request:

1. `apps/portal` with one health route, deployed by Terraform and a workflow.
2. `@parity-app/service` and the two routes, with Pixabay's key as a secret.
3. Main's `SearchService`, which is what makes an installed copy search.
4. [connectors.md](../connectors.md), [support.md](../support.md) and [decisions.md](../decisions.md).
