# Plan: web apps and their backends

Status: draft for discussion. Nothing here is built yet. It turns [app-lenses.md](app-lenses.md) (what each lens shows)
and [extensions.md](extensions.md) (how tools plug in) into an order of work for web apps and the backends behind them.

## In one line

Build the data, API and routes lenses and the scenario data that fills designs, each on open standards first, so any
project that produces a standard works on day one, and each followed by its first adapter, such as Drizzle and TanStack
Router. Then telemetry, then links from code, then writing back. Tests, coverage, the gaps report and performance come
after all of that.

## Why web and backend first

Every other kind of app shares these pieces. A CLI, a desktop app and a mobile app call the same API and read the same
database, so the data and API models, the links between them and the scenario data serve all of them. Web apps also
render the way Parity already does, so nothing blocks them.

## Standards first, then adapters

Each lens is built in two passes:

1. **The standards pass.** The lens reads only an open standard, or a format nearly every tool writes. It works for any
   project that produces that format, whatever its framework, and the lens's model takes shape without being tied to a
   tool.
2. **The adapter pass.** Adapters for particular tools produce the standard when a project doesn't, add what the
   standard can't say, and write changes back in the project's style.

| Lens                | Pass 1: standards                                        | Pass 2: adapters                                      |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Data                | SQL: the database's own catalog, and SQL migration files | Drizzle, then Prisma                                  |
| API                 | OpenAPI 3.1 and 3.2, JSON Schema                         | Hono, oRPC, server functions, Next.js route handlers  |
| Routes              | Parity's route model, with paths as WHATWG URL patterns  | TanStack Router, then React Router and Next.js        |
| Mocks and seed data | OpenAPI and JSON Schema, served by MSW; SQL inserts      | drizzle-seed                                          |
| Telemetry           | OpenTelemetry traces over OTLP                           | Instrumentation the scaffolder sets up                |
| Links               | Drawn by hand, then from traces                          | The TypeScript compiler, following calls through code |

Routes have no standard at all, so Parity defines that model and builds on the standards around it.

**The lenses come in the order you set:** databases, the API, routes and mock data with their scenarios, then telemetry.
Each lens's first adapter comes right after its standards pass, before telemetry. Links from code come after telemetry,
and writing back after that. Tests, coverage, the gaps report and performance wait until all of this works; see
[Later](#later-once-the-core-works).

## Foundations, before any lens

- **Canvas objects and links.** `.par` gains kinds for tables, operations and routes, and typed links between them, such
  as screen → route → operation → table. The models themselves are read from the project every time and never copied
  into `.par`. It keeps only what a person decides: where objects sit on the canvas, a link drawn by hand, or a choice
  between two sources.
- **Defined models.** Each lens's model (tables, operations, routes, scenarios, links) is a versioned JSON Schema, as
  `.lib.par` is today, so adapters and agents target the model rather than Parity's code. They stay private until you
  decide to open them up.
- **One process manager.** It starts, watches and stops what the lenses need: dev servers and `wrangler dev` now, and
  test runners and preview builds later. It tracks ports and logs, stops everything when a project closes, and keeps to
  a memory limit. Starting and stopping Storybook is its first piece.
- **Connections and secrets.** Database URLs and service keys are entered by you and stored with the system keychain
  (Electron's safeStorage), never in the project or `.par`. Database connections are read-only.
- **A full-stack example.** A project from the Buildkit scaffolder, with a router, an API and a database, to build every
  lens against. The current example has none of these.
- **Agent calls.** Each lens adds a call to the agent API as it lands, as `Accessibility()` did: `Tables()`,
  `Operations()`, `Routes()`, `Scenarios()`, `Traces()` and `Links()`.

## Pass 1: standards

### Data

- **A live database describes itself.** Postgres, MySQL and SQL Server do it in `information_schema`, which is part of
  the SQL standard, and Postgres's `pg_catalog` adds enums, indexes and comments. That's one reader per database family,
  not per tool. The open-source DBML connector already reads these into JSON and is a starting point.
- **SQLite and Cloudflare D1** have no `information_schema`, but their `PRAGMA` statements give the same facts. Wrangler
  keeps local D1 databases as SQLite files in the project's `.wrangler` folder, so local development needs no
  credentials.
- **Migration files are the code's schema.** Drizzle, Prisma and most other tools write plain SQL migrations. Parity
  replays them into an in-memory database (SQLite, or PGlite, which is Postgres compiled to WebAssembly) and reads its
  catalog the same way as a live one, so there's no SQL parser to write. A migration that uses something the in-memory
  database can't run falls back to the live database.
- **Drift.** When both are there, the lens shows where the database and the migrations disagree.
- **It shows** the ERD: tables, columns, types, what can be null, keys, indexes and relations.

### API

- **An OpenAPI document,** from a file in the project or a URL the running app serves, in version 3.1 or 3.2.
- **Parity's API model is a list of operations.** Each has an id, an input schema and an output schema in JSON Schema,
  and a method and path when it's HTTP. It can always be exported as OpenAPI 3.2, so nothing is lost by using it. Server
  functions fit as operations marked with an `x-` extension field, and 3.2 can describe server-sent event streams.
- **It shows** the operations, their inputs, their responses and their errors.

### Routes

- **No standard describes an app's routes,** so Parity defines the model: a tree of routes, each with its path as a
  WHATWG URL pattern, its layouts, and the file that draws it.
- **In this pass, routes come from links a person draws.** A person links a screen to a URL, and its URL pattern is
  where the screen, the operations it calls and, later, its tests and traces all meet. Reading the router itself waits
  for pass 2.

### Scenarios, mocks and seed data

- **A scenario** is a name, its data and a design state: "Empty", "Very long", "Server error". Any design state can have
  one.
- **Designs show scenario data through bindings.** A layer's text, or a layer repeated for each item, binds to a field
  of an operation's response, and the design state's scenario fills it.
- **Running code gets the same data over the network.** MSW's `fromOpenApi` builds request handlers from the OpenAPI
  document as the app runs, with nothing written into the project. Parity serves them to routes it renders and to
  Storybook. Its docs mention OpenAPI 2.0 and 3.0, so 3.1 needs checking.
- **Seed data comes from the data model,** written as SQL inserts into a local database or PGlite. Generation is seeded,
  so the same scenario gives the same rows and frames don't change between runs.

### Telemetry

- **OpenTelemetry from the running app.** A trace joins a click in the browser to its handler and the handler's database
  queries, through the W3C `traceparent` header, with errors and timings. The HTTP and database fields are stable:
  `http.route`, `db.collection.name` and `db.query.text`.
- **Parity receives traces itself over OTLP** while the app runs locally, so no monitoring service is needed during
  development. Production telemetry comes later and is opt-in, with keys you enter, stored in the system keychain.
- **It shows** each route's operations and queries with their timings and errors, and links from route to operation to
  table, each with the trace that proves it, including calls the code doesn't make obvious.
- **The app has to send traces.** A scaffolder project would from the start. Cloudflare Workers can trace fetch, KV, R2
  and D1 calls without code, through an export that's still in beta.

## Pass 2: adapters

You placed these on 2026-10-28: each lens's first adapter comes right after its standards pass and before telemetry.
Links from code come after telemetry, and writing back after that. In this order:

1. **Drizzle.** Read the TypeScript schema with `drizzle-kit`'s programmatic API, so a change shows before its migration
   exists. Show relation names, write schema changes back, and seed with `drizzle-seed`. Whether the API changed in
   Drizzle v1 needs checking.
2. **API producers.** Run the project's own generator for Hono (`hono-openapi` or `@hono/zod-openapi`) and oRPC. For
   server functions, such as TanStack Start's `createServerFn` and Next.js server actions, read input schemas through
   Standard JSON Schema (Zod 4 and ArkType natively, Valibot through `@valibot/to-json-schema`) and output types through
   the TypeScript compiler. For Next.js route handlers and Hono routes without schemas, read paths and methods from the
   files and code, and mark the types as inferred.
3. **Routes.** TanStack Router first, from the route tree its generator writes (`routeTree.gen.ts`). Then React Router
   from `react-router routes --json`, and Next.js from its Adapter API, stable since 16.2. Other file-based routers go
   through the preset engine in extensions.md.
4. **Links from code.** The TypeScript compiler, which already infers props, follows typed calls: OpenAPI clients,
   Hono's `hc` client, oRPC, server function imports and Drizzle table references. These links don't need the app to
   run. Prisma resolves by model name.
5. **Prisma,** through `@prisma/get-dmmf`. It comes later because that package sits close to Prisma's internals, and
   older versions left out indexes.

## Pass 3: writing back

- **Changes made in Parity are written in the project's style,** and only where an adapter knows how: a migration and
  the ORM schema for a table change, a handler stub and its schema for a new operation, a route file for a new screen.
- **Every write shows as a diff first,** and can be undone like any change from outside.
- **Mock handlers and seed files** are written into `.parity/` from the scenarios and seed data in `.par`, which stays
  the source (decision 5 in app-lenses.md).

## Later, once the core works

These add value once the data, API, routes, scenarios, telemetry and writing back work, so they aren't a priority now.
What they'd read is noted here so it doesn't need researching again.

### Tests and coverage

- **Results come from JUnit XML,** which Vitest, Jest and Playwright all write. **Coverage comes from Istanbul JSON or
  LCOV,** which both of Vitest's coverage providers write.
- **First, Parity reads the reports a project already produces.** Then it runs them itself: Vitest through its Node API,
  Playwright with its JSON reporter, and stories through Storybook's Vitest addon. Unit tests map to components through
  the files they import, and Playwright tests map to routes through the URLs they visit.
- **It shows** pass and fail counts and coverage on each component with a source file, and failing tests on the screens
  they visit once routes are linked.
- **JUnit XML, Istanbul and LCOV aren't formal standards,** but nearly every tool writes them. CTRF, a newer open JSON
  format for test results, isn't at v1 yet. It's worth reading once it is.

### The gaps report

Once the data and API models, the links and the scenarios work, Parity can list:

- columns that can be null where the API says the field is always there, or the other way round;
- operations no screen calls, and tables no operation touches;
- API fields no screen shows, and fields a screen shows that no operation returns;
- screens with no empty or error state for an operation that can return an empty list or an error;
- text that overflows with very long values, which Parity already measures in every frame.

### Performance

- **Core Web Vitals** (loading, layout shift and response to input) are measured by browser APIs that W3C specs define.
  Lighthouse runs them against a production preview, driven by Playwright, for each route with a URL. Lighthouse's user
  flows measure response to input.
- **Bundle size per route.** Vite's build manifest maps each route's lazy chunk to its output files, and a route costs
  its chunk plus what it imports. Next.js's Adapter API lists each page's assets.
- Both need the process manager for a preview build, and routes from the router (pass 2).

## What this gives other kinds of app

A CLI, a desktop app or a mobile app calls the same operations and reads the same tables, so the data, API, links and
scenarios serve them unchanged. What they need of their own (terminal frames, platforms as modes, native renderers)
comes later and builds on this.

## Decisions needed from you

You've decided that standards come first and adapters after. These are the choices inside that:

1. **The order: decided.** Standards first, then adapters: "We focus on standards first, then adapters/plugins." The
   lenses come in the order you set in [decisions.md](../decisions.md) (databases, the API, routes and mock data, then
   telemetry). Each lens's first adapter comes right after its standards pass and before telemetry, then links from
   code, then writing back. Tests, coverage, the gaps report and performance come "after everything else".
2. **Data in designs: decided, bindings.** A layer's text, or a repeated layer, binds to fields of an operation's
   response, filled by the design state's scenario.
3. **Database connections: decided, local and development databases first,** with production only as an opt-in,
   read-only connection per database.
4. **The code's schema: decided, replaying migration files** into an in-memory database and reading its catalog.
5. **The API model: decided, operations,** always exportable as OpenAPI 3.2, with server functions as marked operations.
6. **The example's stack: decided in part, TanStack Router and Drizzle,** "what we're working with mostly today". The
   rest (Hono, Workers, D1) is the scaffolder's choice to make in Buildkit.

The example is a scaffolder project, as you prefer, once the scaffolder is ready (decision 6 in app-lenses.md).
