# Proposal: adapters, connectors and deploy targets

Status: draft for discussion. Nothing here is built yet.

## In one line

Everything Parity recognises, connects to or deploys to is an extension, built on the same interfaces as Parity's own
support for React, Vite, Tailwind and Lucide. A library describes itself as data, in `.lib.par`; every plugin is code.
Supporting Next.js's App Router next to TanStack Router, Hugeicons next to Lucide, an unfamiliar sign-in provider next
to Clerk, or Datadog next to Sentry doesn't mean changing Parity.

## What exists today

The bones are there:

- **Three adapter interfaces** in `packages/core/src/adapters.ts`, each with its own `detect`:
  - `RendererAdapter` for the UI framework;
  - `BuilderAdapter` for the build tool;
  - `StylesAdapter` for the styling framework.
- **`.lib.par`** is already a data-only extension. A component library describes itself (name, stylesheet, breakpoints),
  and any package that ships one loads, whether or not Parity has heard of it.
- **A built-in catalog** in `packages/project/src/libraries.ts` hard-codes nova and Lucide.
- **No connectors now.** Pexels was the first, with its key stored by the system keychain. It's removed for now, because
  Pexels isn't taking new customers.

What's missing is a way to add any of these without changing Parity, and a contract for each kind. Icons show why. Today
an icon set is a whole package, and an icon is an export looked up by name (`lucide/Heart`), which is Lucide's shape.
Hugeicons doesn't fit: its icons are data objects, drawn by one `HugeiconsIcon` component that takes the icon as a prop.

## Three kinds of extension

| Kind          | What it does                                                                   | Examples                                                                               |
| ------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Adapter**   | Recognises a tool in the project, and translates it to and from a Parity model | TanStack Router, Next.js App Router, Lucide, Hugeicons, Drizzle, Better Auth, Tailwind |
| **Connector** | Talks to an outside service, with the person's own account                     | Unsplash, Pexels, Figma import, telemetry backends, flag services                      |
| **Target**    | Takes the app somewhere                                                        | Deploy, preview links, publishing a library                                            |

One package can contribute several. Next.js, for example, is a builder adapter (how components compile) and a routes
adapter (how screens connect).

## Models are the contract

Each lens has one model: the route map, the icon set, the database schema, the roles, the flags, the deployment.

- **Where a standard exists, the model is the standard:** an OpenAPI document, an AsyncAPI document, OpenTelemetry
  traces. An adapter for a tool without one translates the tool into the standard. An adapter for an API framework, for
  example, produces OpenAPI. Parity's core only reads standards and its own few models.
- **Where Parity defines a model, it publishes it** as a versioned JSON Schema, as `.lib.par` is today. Others can then
  write adapters without reading Parity's code.

## What's data and what's code

You decided this: plugins are always code, and `.lib.par` is the data a library uses to describe itself. Presets are a
way Parity's own plugins are written, not something people add.

### 1. A manifest

A package describes itself, as `.lib.par` does now. It grows to cover icons, fonts and illustrations. Both icon shapes
fit one small description:

```jsonc
// Lucide: every export is an icon component.
{ "icons": { "from": "lucide-react", "render": "export" } }

// Hugeicons: icons are data, drawn by one component.
{
  "icons": {
    "from": "@hugeicons/core-free-icons",
    "render": { "component": "HugeiconsIcon", "import": "@hugeicons/react", "prop": "icon" }
  }
}
```

Fluent icons have Lucide's shape, with each icon in Regular and Filled styles and some sizes in the export names
(`Add24Regular`), so their manifest also names the styles and sizes. Either way, generated code is the import a
developer would write. For packages that don't ship a manifest, a shared registry can hold one for them, the way
DefinitelyTyped holds types.

### 2. Presets, inside Parity's own plugins

Many tools share a shape and differ only by convention, so one plugin can handle the family, with each tool described as
data inside it. File-based routers are the clearest case, handled by Parity's file-route plugin:

| Convention           | TanStack Router | Next.js App Router |
| -------------------- | --------------- | ------------------ |
| Folder               | `src/routes`    | `app`              |
| A page               | the route file  | `page.tsx`         |
| A shared layout      | `_name` prefix  | `layout.tsx`       |
| A URL parameter      | `$id`           | `[id]`             |
| A folder outside URL | `(group)`       | `(group)`          |
| The root             | `__root.tsx`    | `app/layout.tsx`   |

Supporting another file-based router means adding its column to that plugin, not writing a new one.

### 3. Code, for every plugin

A plugin is a module that implements the lens's interface: `detect` (with evidence), `read`, `watch`, and optionally
`write`.

- It runs in its own background process, with no access to the interface.
- It only gets what its manifest asks for: the project's files, named network hosts, and secrets through Parity's
  keychain.
- Parity's own built-ins use the same interface, so the interface is always tested by real use.

## The same three questions for every kind of tool

For any kind of tool, ask in this order:

1. **Is there a standard?** Then any tool that speaks it works with settings alone.
2. **What's different about each tool?** That goes in a preset, as data inside the plugin for the family.
3. **What's left?** That's the rest of the plugin's code.

| Kind of tool      | Standard                                     | Per-tool preset (data)                                                                         | Code only for                                                                                       |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Routing           | None                                         | Folder conventions: TanStack Router, Next.js App Router                                        | Routes set up in code, such as React Router's route config                                          |
| Icons             | None                                         | How icons are imported and drawn: Lucide, Hugeicons                                            | Nothing                                                                                             |
| Sign-in and roles | OpenID Connect and OAuth 2.0; SCIM for users | Each provider's endpoints, and where its tokens carry the organisation and role: Clerk, WorkOS | Roles defined in code (Better Auth's access control), or kept in a provider's dashboard (connector) |
| Monitoring        | OpenTelemetry, sent over OTLP                | Each service's endpoint and how it takes the key: Sentry, Datadog, Grafana, Honeycomb          | Reading traces back from a service, since each has its own query API (a connector each)             |
| Feature flags     | OpenFeature; OFREP between apps and services | The provider package for each flag service                                                     | Nothing                                                                                             |
| Deploy            | Better Apps' capability manifest             | None                                                                                           | Each cloud's adapters, in Better Apps                                                               |

Two notes on this:

- **Monitoring needs no service during development.** Parity can receive OpenTelemetry itself while the app runs
  locally, so the runtime lens works before anyone signs up for anything. Sentry or Datadog only matter in production.
  Sentry documents receiving Cloudflare Workers' OpenTelemetry export. Datadog takes OpenTelemetry through its Agent or
  a Collector, and its direct intake is in preview.
- **At run time, sign-in goes through Better Apps' identity interface,** which already covers Better Auth, WorkOS, Clerk
  or none. Parity's part is reading: which roles exist and what each can do, for the permissions lens and "view as
  role".

## Adding a tool to a project

This is later. You said adding connectors such as Sentry, PostHog and LaunchDarkly "belongs in the backlog -- not a
priority right now", through a CLI, either as recipes or through the scaffolder.

Recognising a tool is half of it. The other half is offering it: "Add Sentry" or "Add Clerk" in the catalog, working the
way "Add library" does now. An adapter can include a setup recipe, also as data:

- the packages to install, with the project's package manager;
- the files to create from templates, in the project's style;
- the settings it needs, and which of them are secret.

## Settings

Some tools need settings: an endpoint, a project key, an issuer URL. Each extension declares its settings as a JSON
Schema, and Parity draws the form from it.

- **Ordinary values** go where the tool itself expects them, such as its own config file or the project's environment
  file, written by the adapter. When the tool has no place for them, they go in `parity.config.ts`.
- **Secrets** never go in the project or in `.par`. On your machine they're stored with the system keychain (Electron's
  safeStorage). For a deployed app they go to the deploy service's environments, which Better Apps owns.

## Packaging and discovery

- **A plugin is an npm package** whose manifest lists what it contributes (adapters, connectors, targets) and the
  version of Parity's interface it needs, much as VS Code extensions list theirs.
- **A project adds its own plugins in `parity.config.ts`,** at the project root: "where you might add adapters, plugins,
  configurations, integrations, decorators", as you put it. A plugin from npm is installed as a dev dependency and named
  in the config, so everyone on the team gets the same adapters through the lockfile. The config is optional: what
  Parity can infer still needs none. It runs in Node, in the project service, so decorators, which run in the frames,
  stay in the preview file (see [decorators.md](decorators.md)).
- **Connectors belong to the person, in the app,** because they carry the person's accounts. The Pexels key worked this
  way before Pexels was removed.
- **Most adapters and connectors ship with the app,** and they're how people could widen what Parity supports. A plugin
  in the project's config for the same lens takes precedence over a built-in.
- **A catalog in the app** lists what can be added, as the library catalog does now. Later it can become a registry with
  verified publishers.

## Detection and choice

Several adapters can claim one lens, for instance during a migration from React Router to TanStack Router. So `detect`
returns evidence, not just yes or no: "found `app/` with `page.tsx` files, and `next` 15". Parity picks the strongest
match, shows why in the lens ("Routes from Next.js App Router, found `app/`"), and lets you switch. Only a switch is
saved, in `.par`, unless the project's config already names the adapter; with neither, nothing is configured.

## Connectors

Standards first here too:

- **Sign-in:** OAuth 2.0.
- **The service's API:** OpenAPI.
- **Agents:** MCP, where the service offers an MCP server, so one connector serves the canvas and agents alike.

Keys are entered by the person and stored with the system keychain, never sent to the page. They never go in the project
or in `.par`. Before connecting, Parity shows which hosts the connector talks to and what it reads or writes.

## Deploy targets: Cloudflare today, other clouds later

This follows the direction already set for Better Apps:

- Apps declare what they need (SQL, key-value storage, file storage, queues, scheduled jobs) by using Better Apps'
  capability packages.
- Better Apps' deploy service picks the cloud and sets everything up. Version 1 is Cloudflare only.
- **Adding AWS or Azure** means new adapters for those capability packages, and the deploy service learning the new
  cloud. That's Better Apps' work, and Parity doesn't change.

So Parity has one kind of extension for deploying, a target, and Better Apps' deploy is the first one. **Parity never
names a cloud.** The Infrastructure lens reads the capability declarations, which are the same on every cloud, not a
cloud's own config. Because the capability manifest is open, others can build targets too: a team with its own pipeline
could add a target that starts it.

## Trust

- **Manifests run no code.**
- **Project plugins** add no new trust question. Parity already runs a project's own code to render it (its Vite config,
  its components), so trusting a project includes the plugins its `parity.config.ts` lists. Parity asks once per
  project, as editors do when opening a folder.
- **Plugins a person installs into the app** run in their own process with only the permissions they declared, and the
  catalog shows who published them.

## Agents

Every model an adapter produces is open to agents through the agent API, readable and, where the adapter allows,
writable. Each new adapter gives agents a new call, the way `Accessibility()` arrived with accessibility checks:
`Routes()` would come with routing, `Icons()` with icon sets.

## Suggested order

You decided to build standards first, then adapters, and [web-and-backend.md](web-and-backend.md) sets the order of
work. This proposal fits into it:

1. **During the standards pass, nothing here is needed.** Each lens reads its standard directly. The one piece that
   comes first is the models, as versioned JSON Schemas kept private, which that plan lists among its foundations.
2. **With the adapter pass, one registry of contributions.** The three existing adapter interfaces, library detection
   and the new lens adapters register through it, the built-ins included.
3. **The preset engine,** first for file-based routes (TanStack Router and Next.js App Router), as that plan's adapter
   pass expects.
4. **Icons in the manifest,** with Hugeicons as the test that the shape isn't Lucide's.
5. **Code adapters** in their own process, and project plugins from `parity.config.ts`.
6. **Deploy targets,** with Better Apps' deploy as the first.
7. **The catalog.** There's no outside registry while nothing is open source. Setup recipes come later.

## Decisions needed from you

1. **The structure: decided, every plugin is code.** `.lib.par` is the data a library uses to describe itself, and
   router presets are internal to Parity's file-route plugin.
2. **Where plugins live: decided.** Most adapters and connectors ship with the app. A project adds its own in
   `parity.config.ts` at the project root, which is optional: what Parity can infer still needs no config.
3. **The manifest: decided, `.lib.par` grows** to describe icons and plugins too. It has already grown tokens and a
   canvas.
4. **Deploy: decided, Better Apps' deploy only for now:** "I'm inclined to use just Better Apps deploy." You asked
   whether a Terraform target would cover everything. It covers provisioning on almost any cloud, but not deploying:
   someone still writes the modules for each cloud, it doesn't build or upload the app, it needs remote state and
   credentials, and plan-then-apply is slow for every deploy. Its licence is BSL since 2023, with OpenTofu as the open
   fork. It could be a later target for teams that already manage infrastructure that way.
5. **When to open it up: decided, not now.** Nothing is open-sourced while Parity is this early: not the app, the
   interfaces, the models or the manifest formats. Everything is still built as extensions, so opening up later is a
   licensing decision, not a rewrite.
6. **Offering tools: later.** Adding connectors such as Sentry, PostHog and LaunchDarkly through a CLI, as recipes or
   through the scaffolder, "belongs in the backlog -- not a priority right now."
