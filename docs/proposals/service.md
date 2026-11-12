# Proposal: Parity's service, starting with stock media search

Status: draft for discussion, 2026-11-11 (PAR-131). Nothing here is built. It says where Parity's server code runs, how
it grows, and what its first route does. Calls already made are in
[decisions.md](../decisions.md#keys-are-the-app-owners-and-parity-reports-uses-itself-par-829); the connectors it serves
are in [connectors.md](../connectors.md).

## In one line

One TanStack Start app, `apps/portal`, runs on a Cloudflare Worker. It ships first with no pages, only an API under
`https://api.tryparity.dev/v1`, and its first route runs stock media searches with Parity's keys. The portal's screens,
and every later API, join the same app until a piece has a reason to leave it.

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

| Route                             | Takes             | Gives                                  |
| --------------------------------- | ----------------- | -------------------------------------- |
| `GET /v1/connectors`              | Nothing           | The ids of the connectors it searches  |
| `POST /v1/connectors/{id}/search` | A `SearchRequest` | A `SearchAnswer`: results or a problem |

- **The service runs the same adapters as the app,** with `checkRequest` first, so an answer is the same whether main or
  the service ran the search.
- **A problem is still an answer.** A search the source refused comes back as `{ problem }` with status 200. The
  service's own refusals use the same body with a matching status: 400 for `invalid`, 429 with `Retry-After` for
  `rate-limited`, and 503 for `unavailable`. `no-key` and `key-refused` reach the app as `unavailable`, since only the
  owner can fix them, and the service reports them to Sentry.
- **A request without a session gets 401** and a `signed-out` problem, a new code in `@parity-app/connectors`.
- **Pictures and videos still load straight from the source.** The service passes on links and never the files.
- **`placed` has no route yet.** Neither offered connector has one. Unsplash's would be
  `POST /v1/connectors/{id}/placed`, added if it's offered again.
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
- **Each person is limited,** by their WorkOS user id, with the Workers rate limiting binding. The binding counts in
  each Cloudflare location over 10 or 60 seconds and isn't exact, which is enough to stop a loop. The number is set once
  there's real use: to start, 30 searches a minute.
- **Requests without a session are limited by address,** so guessing at the API costs the service nothing but a refusal.

## Who can call it

**Signed-in people only** (your call, 2026-11-11). A limit counted for each person is much harder to get round than one
counted for an install id, which anyone can make up.

- **Main sends its WorkOS access token** as `Authorization: Bearer`, and the window still never sees it.
- **The service checks the token's signature, issuer and expiry** against WorkOS's published keys, as Better Apps'
  WorkOS identity does (PAR-615). That needs WorkOS's client ids, which are public, and not its API key. The API key
  comes with the routes for organizations (PAR-616).
- **Signed out, the app doesn't ask the service.** Main answers `signed-out` itself, the library browser shows Sign in
  where its results would be, and an agent is told to carry on without the source, as with `no-key`.
- **Sign-in is heading towards required for the whole app** (your direction, 2026-11-11). Today it's optional
  (decisions.md, "Signing in is optional"), so this route handles a signed-out copy. Once the app requires it, that
  state goes away. Changing that decision is its own piece of work, not part of PAR-131.
- **A token that expires mid-search is refreshed and the search sent once more.** WorkOS's tokens last 5 minutes and
  main already refreshes them.
- **An installed copy has to be able to sign in first.** PAR-612 left that untried, so it's the first thing to prove.

## Personal data

The service keeps none of its own. A person's WorkOS user id is only the key to a counter that expires in a minute, and
an address the same for a refused request. What was searched is kept only as the hash in the cache's key, beside the
source's answer, with nothing saying who asked. Logs and Sentry get the connector, the kind, the filters, how it ended
and how long it took, as `connectors.searched` does, and never the query or who sent it.

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
- **`infra/cloudflare`:** the shared `cloudflare-web` module from `betterapps-hq/pipelines`, which Storybook's previews
  already sit beside. It makes a Worker for each of `staging` and `production`, the custom domain, one deploy token and
  the GitHub settings the web templates read (`cd-web-deploy`, `cd-web-promote`, `preview-web`), and passes on the
  Worker's secrets. Pull requests get Worker previews, and Neon branches once there's a database. No deploy workflow is
  written here. The KV namespace and the rate limits are bindings in the app's Wrangler config, which deploys own.

**New dependencies, which need your agreement:** `@tanstack/react-start`, `@cloudflare/vite-plugin` and `wrangler`.
TanStack Start 1.0 is reported to need Vite 8; that's checked against this repository's `vp` before anything is added.

## Still to check

- An app with no pages builds and deploys.
- The Worker's size limit. Cloudflare's limits page was read as 64 MiB before compression, which is far more than this
  needs, but the figure wasn't confirmed.
- Whether the rate limiting binding costs anything. Its page doesn't say.
- Mobbin's API terms.
- Whether Better Apps' WorkOS identity can be installed in this repository, or its check is written here on `fetch` and
  zod as `@parity-app/account` was.

## Decisions needed from you

1. **Who can call it: decided, signed-in people only** (your call, 2026-11-11).
2. **Mobbin:** after a check of its terms (recommended), from the start, or not at all.
3. **The domain: decided, `api.tryparity.dev`** (your call, 2026-11-11), a custom domain on the Worker, on the zone
   Cloudflare already holds. The portal's pages get their own host on the same Worker later.
4. **The three new dependencies** above.

## The work, once this is agreed

Each is its own issue and pull request:

1. Sign-in tried in an installed build (PAR-612's last step).
2. `apps/portal` with one health route, deployed through the shared pipelines to `api.tryparity.dev`.
3. `@parity-app/service` and the two routes, with the session check and Pixabay's key as a secret.
4. Main's `SearchService` and the `signed-out` problem, with Sign in in the library browser, designed in Storybook
   first. This is what makes an installed copy search.
5. [connectors.md](../connectors.md), [editor.md](../editor.md), [support.md](../support.md) and
   [decisions.md](../decisions.md).
