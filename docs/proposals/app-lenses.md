# Proposal: seeing the whole app

Status: draft for discussion. Nothing here is built yet.

## In one line

Parity shows each layer of an app as its own view, a **lens**, read from the project the way Storybook already is. The
lenses link up, so you can follow a click from a button to the endpoint, the tables, the role and the events behind it,
and see what a change in one layer touches in the others.

## What exists today

- **Screens:** the canvas, with designs, states and modes.
- **Components:** Storybook, detected rather than configured.
- **Accessibility:** axe checks per layer, and the tab order overlay.
- **Discussed so far:** an ERD for the database and OpenAPI for the API.

## The principle: standards in front, adapters behind, nothing required

Every lens has to be read from something, and each new thing Parity reads is a pull toward choosing a stack. The answer
is to decide where that choice lives, not to avoid it. Parity already works this way: Storybook is detected, packages
are found the way Node finds them, the package manager comes from the lockfile, and Lucide is recognised from
`lucide-react`.

Each lens reads its layer in this order:

1. **An open standard, where one exists.** Parity reads OpenAPI, not a particular API framework. Any tool that produces
   the standard works without Parity knowing about it. Examples: OpenAPI, AsyncAPI, JSON Schema, OpenFeature,
   OpenTelemetry, ICU messages, design tokens (DTCG).
2. **An adapter, where there's no standard.** Routers, auth roles and ORM schemas have none, so each tool gets an
   adapter that fills one shared model per lens. The first adapters cover the stack Parity is built around (React, Vite,
   Cloudflare). More can follow, written by us or by others.
3. **Nothing found: the lens stays out of the way.** It can offer to set the source up, but no lens is ever required.

**Reading is easy to keep neutral; writing isn't.** Parity can read many tools, but whatever it writes into a project
(generated components, mock handlers, seed data) has to fit that project. So Parity writes in the project's own detected
style, and only where an adapter knows how.

**Opinions belong in a stack, not in Parity.** Parity stays neutral. A stack that's opinionated, such as projects from
the Buildkit scaffolder, lights up every lens on day one because it uses the standards and the first adapters. That's
the same split as neutral Better Apps and opinionated Buildkit.

## The lenses

| Lens           | Read from (standard first)                                                  | Shows                                                                                       | Can write              |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| Screens        | `.par` designs                                                              | The canvas (exists)                                                                         | Components (proposal)  |
| Components     | Storybook                                                                   | Stories (exists)                                                                            | Stories                |
| Flows          | Router files (adapters: TanStack Router, React Router)                      | A route map, user flows between screens, and sign-in guards on the links                    | Routes for new screens |
| Behaviour      | XState machines, or the component states Parity has                         | Statecharts for multi-step flows, each state linked to its design                           |                        |
| Data           | ORM schema (adapters: Drizzle, Prisma) or the database                      | The ERD                                                                                     | Seed data              |
| API            | OpenAPI                                                                     | Endpoints and their shapes, and which screens call them                                     | Mock handlers (MSW)    |
| Forms          | JSON Schema, including Zod's output                                         | Fields, rules and error messages as form states                                             |                        |
| Events         | AsyncAPI                                                                    | Queues, webhooks, Durable Object messages and scheduled jobs                                |                        |
| Permissions    | Auth roles (adapter: Better Auth access control first)                      | A table of roles, resources and actions, and "view as role" on the canvas                   |                        |
| Flags          | OpenFeature                                                                 | Which flags affect which screens; each variant previewed like a mode                        |                        |
| Messages       | Notification workflows and email templates (adapters)                       | Rendered emails and notifications beside the screen that sends them                         |                        |
| Languages      | ICU message catalogs                                                        | Every screen in each language, plus stretched fake text to catch overflow                   |                        |
| Infrastructure | Better Apps' capability declarations; Wrangler config as a fallback adapter | What the app needs (SQL, storage, queues, scheduled jobs) and how it connects, on any cloud |                        |
| Runtime        | OpenTelemetry                                                               | Real traces, errors and timings on the screens and endpoints they belong to                 |                        |

## Linking the lenses

A lens on its own is what existing tools already do. The links are what only Parity can do, because it sees the designs
and the code together.

- **Links from code.** A button's handler calls an OpenAPI operation. That operation's handler queries tables, checks a
  role and sends events. Parity infers what it can and shows what it found; partial links are still useful.
- **Links from traces.** OpenTelemetry carries a trace from a click in the browser to the Worker and its database
  queries, joined by the W3C `traceparent` header. Cloudflare Workers can trace fetch, KV, R2 and D1 calls with no code
  and export them over OTLP; that export is in beta.
- **What the links are for:**
  - **Trace a click:** select a button and see everything behind it.
  - **Impact of a change:** rename a column and see the endpoints and screens it touches.
  - **Gaps:** screens without an empty or error state, endpoints no screen uses, and roles that can reach a screen
    nobody designed for them.

## Flags and telemetry together

**OpenFeature** is an open standard for feature flags, an incubating CNCF project. Code asks one neutral API for a
flag's value, and a provider for the actual flag service plugs in behind it. That service could be LaunchDarkly,
Unleash, GrowthBook or flagd, among others. Flags are evaluated against a context, such as who the user is, and hooks
can run around every evaluation.

**It lines up directly with OpenTelemetry.** OpenTelemetry's conventions define a `feature_flag.evaluation` event, with
the flag's key, the variant served (`feature_flag.result.variant`) and the provider's name. OpenFeature's observability
appendix maps onto those attributes. The event conventions are a release candidate and not yet available in every
language.

Together they cover both ends:

- **Before release, from OpenFeature:** which flags exist, which screens read them, and a preview of each variant in its
  own frame.
- **After release, from OpenTelemetry:** which variant real requests got, and errors and timings per variant, shown on
  that variant's frame.

**Rollouts, rings and targeting belong to the flag service, not to OpenFeature.** OpenFeature passes a context with
every evaluation: a targeting key, usually the user's ID, plus any attributes, such as the organisation, environment or
ring. The service applies its rules and percentage rollouts to that context, and the same context gets the same answer
every time. OpenFeature doesn't standardise how rules are written; flagd, its reference service, uses JSON Logic, with a
`fractional` rule for percentage rollouts. OFREP, a young and still-changing standard, defines the HTTP calls between
OpenFeature SDKs and a flag service.

**"View as" sets that context.** A frame can show a screen as a given user, in a given organisation and ring, with the
variants that user would really get. "View as role" works the same way.

**Better Apps:** its flags feature already covers rollouts, rollbacks, rings and targeting by environment, user and
organisation. If it's also an OpenFeature provider, or speaks OFREP, Parity sees it the same way as any other flag
service, with nothing specific to Better Apps.

## Suggested order

You set the order: "1) Databases 2) API 3) Telemetry", then "Routes and mock data should come before telemetry, right
after the API." For web apps, [web-and-backend.md](web-and-backend.md) plans the work in that order.

1. **Databases, the ERD,** from the project's schema.
2. **API, from OpenAPI.**
3. **Routes and mock data.** Flows from the router turn separate screens into an app, the "app layer" item from the
   editor must-haves. Mock data from OpenAPI and the ERD gives every design and state realistic data, including empty,
   very long and error cases.
4. **Telemetry, from OpenTelemetry,** starting with local development traces from the running app.
5. **Permissions, with "view as role".** It reuses the modes mechanism.
6. **Flags, from OpenFeature,** previewed as modes.
7. **The rest** as projects bring the sources.

The example project has no router, API or database yet. These lenses need a fuller example to be built against, and a
project from the Buildkit scaffolder is the one you prefer, once the scaffolder is ready.

## Decisions needed from you

1. **The principle: decided.** Standards in front, adapters behind, nothing required, built standards first.
2. **First adapters: decided, TanStack Router and Drizzle.** In your words: "Let's start with Tanstack and Drizzle.
   These are what we're working with mostly today." The rest of the example's stack is the scaffolder's to choose.
3. **Where lenses live: decided, each lens as its own canvas page,** with links jumping between pages and the design
   canvas staying the main view.
4. **Runtime data: decided, local development traces first,** with production telemetry later and opt-in. Keys for
   telemetry services are entered by you and stored with the system keychain.
5. **Where written files go: decided, `.par` first, with a `.parity` folder when a tool needs real files.** You called
   it "a hard compromise": everything in `.par` is best, "but for flexibility, we should put things in the .parity
   folder when we need to." Your worry was that a `.par` copied on its own would lose those files. So `.par` holds the
   scenarios and seed data, as the source, and `.parity/` holds only files written from it for tools that need them,
   such as MSW handlers. A copied `.par` loses nothing, because the folder can be written again from it.
6. **The example: decided, a Buildkit scaffolder project,** once the scaffolder is ready. In your words: "I don't know
   if scaffolder is ready, but yeah, that's the preferred route."
