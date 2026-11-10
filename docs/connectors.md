# Connectors

A connector brings things in from an outside service: screens from Mobbin and photos from Unsplash today. This page says
how one is built and what adding the next one takes. What was decided, and why, is in
[decisions.md](decisions.md#connectors-search-outside-services-from-main-par-829).

## How it fits together

```text
@parity-app/connectors        data in, data out: no Electron, no state, fetch passed in
├── connector.ts              the contract: requests, filters, results, problems, checkRequest
├── request.ts                what every adapter shares: prepare, sendSearch, notify, refusal
├── mobbin.ts                 Mobbin's REST API: screens, by platform and depth, paged by exclude
├── unsplash.ts               Unsplash's API: photos, by orientation and color, paged by page, with picked
└── index.ts                  `connectors`, the list main runs, and the key variables

apps/desktop
├── main/connectors.ts        the hub: keys, every search, find by kind, picked, a service, connectors.searched
├── main/connector-keys.ts    keys encrypted with safeStorage in <userData>/connector-keys
├── shared/connectors.ts      what the window sees and sends, checked with zod
├── utility/references.ts     agents' searches for screens and photos, through main, with previews saved
└── scripts/dev.ts            passes PARITY_*_KEY from .env.local to main
```

- **The window asks main over IPC:** `canvasHost.connectors` gets the list (each connector's details and where its key
  comes from, never the key), searches, sets and clears a key, and reports a result someone used.
- **Agents search by kind, not by source.** `find_references` (`parity references`) finds screens and `find_photos`
  (`parity photos`) finds photos. Each asks the service, which asks main to find that kind, and main picks the first
  connector that finds it and has a key, so the next screens or photos source reaches agents without a new call.
- **Filters are data.** Each connector lists its filters in `info.filters`, with their values and defaults: Mobbin's
  platform and depth, Unsplash's orientation and color. A search sends `filters: { platform: "ios" }`, `checkRequest`
  refuses a filter or value the connector doesn't list and fills in defaults, and the window can draw the controls from
  the list.
- **An answer says how many searches are left** when the source says, as `allowance`. `sendSearch` reads the
  `X-RateLimit-Remaining` and `X-RateLimit-Limit` headers, which Unsplash sends and Mobbin doesn't.
- **A service can run searches for main.** The hub takes a `SearchService` that searches some connectors with keys of
  its own. A connector with no key here goes to it, for searches and picks, and a key here still wins. Nothing
  implements one yet: it's where Parity's own service plugs in to hold the Unsplash key for shipped builds.
- **A search never throws.** Its answer is what it found or a problem: `no-key`, `key-refused`, `no-access`,
  `rate-limited` (with `retryAfter` when the source says), `invalid` (with the field) or `unavailable`.

## Adding a connector

1. **Write the adapter** in `packages/connectors/src/<id>.ts`: its `info` (what it finds, which filters it takes, its
   limits, how it pages, and its `apiKey`: what the source calls it, where to get one and its variable), a `probe` (the
   smallest search, which checks a key), `search`, and `picked` when the source's terms ask to be told of each use. Its
   filters go in `info.filters`, each with the source's own values, so the adapter can send them as they come. `search`
   starts with `prepare`, which refuses a filter the connector doesn't take and asks for a missing key, then sends with
   `sendSearch`, which turns a failed, slow or unreadable answer into a problem and reads how many searches are left.
   What's left is the adapter's own: its URL and request, its answer's schema, mapping a result to `Found`, and what
   each of the source's failures means, in words a person can act on. Test them with a stand-in `fetch`.
2. **Add it to `connectors`** in `packages/connectors/src/index.ts`. Main, `pnpm dev`, the key store, the window's list
   and agents' search for its kind pick it up from there. A kind no agent call finds yet needs one: a contract in
   `packages/agent`, a `search…` in `utility/references.ts` that maps its fields to filters, and its CLI command and MCP
   tool.
3. **Name its variable in `apps/desktop/.env.example`,** with where to get a key.
4. **Try it live** with a key in `apps/desktop/.env.local`, from a script that reads the file and never prints the key.
5. **Record the source's terms** in decisions.md: credit, caching, what it must be told, and its limits.

## Pattern changes made

What adding Unsplash after Mobbin showed, and what changed for each:

- **Filters are data.** Before, each new filter widened the shared request, `ConnectorInfo` and `checkRequest`. Unsplash
  added `orientation`, `color` and `page`. Now a connector lists its filters, and nothing shared changes for a new one.
- **One agent call per kind.** Before, `find_references` was Mobbin's screens, and agents couldn't search photos. Now
  `find_photos` finds photos, and each call reaches whichever connector finds its kind.
- **Say how much is left.** Mobbin allows 60 searches a minute for each workspace, and Unsplash 50 an hour until it's
  approved. Answers now carry `allowance` when the source says, so the window and agents can slow down before they're
  turned away.
- **Leave room for Parity's service.** The hub can now send a connector's searches to a `SearchService`, with the
  adapters unchanged. Plugging Parity's own service in takes no change to them.
- **Share the request plumbing.** `prepare`, `sendSearch` and `notify` are in `request.ts`. Before, each adapter built
  its request, caught a failed or slow fetch and parsed its answer the same way, in its own words.
- **Name keys from the connector, everywhere.** Each connector names its variable, and main and `pnpm dev` read it from
  there. Before, the Unsplash key had to be added in four places.

Still open: an agent that uses a photo can't yet tell Unsplash, as its terms ask for each photo used. The window does,
through `picked`. Agents need a call for it, or a rule that using a photo's image URL reports it.
