# Connectors

A connector brings things in from an outside service: screens from Mobbin and photos from Unsplash today. This page says
how one is built and what adding the next one takes. What was decided, and why, is in
[decisions.md](decisions.md#connectors-search-outside-services-from-main-par-829).

## How it fits together

```text
@parity-app/connectors        data in, data out: no Electron, no state, fetch passed in
├── connector.ts              the contract: requests, results, problems, checkRequest
├── request.ts                what every adapter shares: prepare, requestJson, notify, refusal
├── mobbin.ts                 Mobbin's REST API: screens, by platform, paged by exclude
├── unsplash.ts               Unsplash's API: photos, by orientation and color, paged by page, with picked
└── index.ts                  `connectors`, the list main runs, and the key variables

apps/desktop
├── main/connectors.ts        the hub: keys, every search, picked, connectors.searched
├── main/connector-keys.ts    keys encrypted with safeStorage in <userData>/connector-keys
├── shared/connectors.ts      what the window sees and sends, checked with zod
├── utility/references.ts     agents' searches, through main, with previews saved
└── scripts/dev.ts            passes PARITY_*_KEY from .env.local to main
```

- **The window asks main over IPC:** `canvasHost.connectors` gets the list (each connector's details and where its key
  comes from, never the key), searches, sets and clears a key, and reports a result someone used.
- **Agents ask the service,** which asks main, so a key stays in main. `find_references` and `parity references` search
  Mobbin's screens.
- **A search never throws.** Its answer is what it found or a problem: `no-key`, `key-refused`, `no-access`,
  `rate-limited` (with `retryAfter` when the source says), `invalid` (with the field) or `unavailable`.

## Adding a connector

1. **Write the adapter** in `packages/connectors/src/<id>.ts`: its `info` (what it finds, which filters it takes, its
   limits, how it pages, and its `apiKey`: what the source calls it, where to get one and its variable), a `probe` (the
   smallest search, which checks a key), `search`, and `picked` when the source's terms ask to be told of each use.
   `search` starts with `prepare`, which refuses a filter the connector doesn't take and asks for a missing key, then
   sends with `requestJson`, which turns a failed, slow or unreadable answer into a problem. What's left is the
   adapter's own: its URL and request, its answer's schema, mapping a result to `Found`, and what each of the source's
   failures means, in words a person can act on. Test them with a stand-in `fetch`.
2. **Add it to `connectors`** in `packages/connectors/src/index.ts`. Main, `pnpm dev`, the key store and the window's
   list pick it up from there.
3. **Name its variable in `apps/desktop/.env.example`,** with where to get a key.
4. **Try it live** with a key in `apps/desktop/.env.local`, from a script that reads the file and never prints the key.
5. **Record the source's terms** in decisions.md: credit, caching, what it must be told, and its limits.

A filter the contract doesn't have yet (a source's own sort order, say) goes into `searchRequest` and `ConnectorInfo`
together, and `checkRequest` refuses it for every connector that doesn't name it.

## Pattern changes to make

What adding Unsplash after Mobbin showed, in the order they'd save the most work:

- **Declare filters as data.** Each new filter widens the shared request, `ConnectorInfo` and `checkRequest`: Unsplash
  added `orientation`, `color` and `page`. A list of filters in `info`, each with its name and values, would let the
  window draw a connector's controls and `checkRequest` check them with nothing added per filter.
- **One agent call per kind, not per source.** `find_references` is Mobbin's screens; agents can't search photos yet.
  `find_photos`, or one call taking the kind, should reach every connector that finds it.
- **Say how much is left.** Limits differ: Mobbin's 60 a minute per workspace, Unsplash's 50 an hour until approved. The
  answer could carry what the source says remains (Unsplash's `X-Ratelimit-Remaining`), so the window and agents slow
  down before they're turned away.
- **Leave room for Parity's service.** The plan is for a service of Parity's to hold the Unsplash key, and Mobbin's once
  it agrees (decisions.md). Today main calls each source with a key it holds. The hub should be able to send a search to
  the service instead, with the connector's mapping unchanged, so that move doesn't touch the adapters.
- **Share the request plumbing.** Done: `prepare`, `requestJson` and `notify` in `request.ts`. Before, each adapter
  built its request, caught a failed or slow fetch and parsed its answer the same way, in its own words.
- **Name keys from the connector, everywhere.** Done: each connector names its variable, and main and `pnpm dev` read it
  from there. Before, the Unsplash key had to be added in four places.
