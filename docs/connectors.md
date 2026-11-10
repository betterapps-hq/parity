# Connectors

A connector brings things in from an outside service: screens from Mobbin and photos from Unsplash today. This page says
how one is built and what adding the next one takes. What was decided, and why, is in
[decisions.md](decisions.md#connectors-search-outside-services-from-main-par-829).

## How it fits together

```text
@parity-app/connectors        data in, data out: no Electron, no state, fetch passed in
├── connector.ts              the contract: requests, filters, auth, results, problems, checkRequest
├── recent.ts                 a recent search, and how one joins the list: remember
├── request.ts                what every adapter shares: prepare, sendSearch, notify, refusal
├── mobbin.ts                 Mobbin's REST API: screens, by platform and depth, paged by exclude
├── unsplash.ts               Unsplash's API: photos, by orientation and color, paged by page, with picked
└── index.ts                  `connectors`, the list main runs, and the key variables

apps/desktop
├── main/connectors.ts        the hub: keys, every search checked and budgeted, find, recent, picked, a service
├── main/search-history.ts    the person's recent searches, in <userData>/recent-searches.json for now
├── shared/connectors.ts      what the window sees and sends, checked with zod
├── utility/references.ts     agents' searches for screens and photos, through main, with previews saved
└── scripts/dev.ts            passes PARITY_*_KEY from .env.local to main
```

- **Keys are the app owner's.** People never enter one. A connector's `auth` says whether it needs a key and which
  variable a development copy sets it with. Main reads them once and takes them out of its environment. A shipped copy
  will search through Parity's service, which holds them.
- **The window asks main over IPC:** `canvasHost.connectors` gets the list (each connector's details and whether this
  copy can search it, never a key), searches, lists the person's recent searches, and reports a result someone used.
- **Main checks every search before it routes it,** against what the connector takes, fills in its defaults, and keeps
  each connector to 30 searches a minute, so a loop can't spend a source's allowance. `connectors.searched` records the
  filters as checked.
- **Agents search by kind, not by source.** `find_references` (`parity references`) finds screens and `find_photos`
  (`parity photos`) finds photos. Each can name a `connector`; without one, main picks the first connector that finds
  the kind, takes every filter named and has a key. Every field besides the search's own is passed on as a filter, so a
  new connector's filter reaches it without a change to `utility/references.ts`. Each result names its connector.
- **Recent searches go through a `SearchHistory`.** The hub adds each search that works in the window, never an agent's,
  with every filter it ran with, and `remember` keeps each connector's latest five. `localHistory` keeps them in a file
  for now; once Parity's service keeps them on the person's account, main passes the hub one that asks it.
- **Uses are reported by Parity, not by whoever used the result.** `picked` sends only a result the hub gave lately,
  from its own copy. Agents get no call for it, since one could skip it: the plan is for Parity to report an Unsplash
  photo when it's placed in a design, by a person or an agent. Nothing places photos yet.
- **Filters are data.** Each connector lists its filters in `info.filters`, with their values and defaults: Mobbin's
  platform and depth, Unsplash's orientation and color. A search sends `filters: { platform: "ios" }`, `checkRequest`
  refuses a filter or value the connector doesn't list and fills in defaults, and the window can draw the controls from
  the list.
- **An answer says how many searches are left** when the source says, as `allowance`. `sendSearch` reads the
  `X-RateLimit-Remaining` and `X-RateLimit-Limit` headers, which Unsplash sends and Mobbin doesn't.
- **A service can run searches for main.** The hub takes a `SearchService` that searches some connectors with keys of
  its own. A connector with no key here goes to it, for searches and picks, and a key here still wins. Nothing
  implements one yet: it's where Parity's own service plugs in to hold the keys for shipped builds.
- **A search never throws.** Its answer is what it found or a problem: `no-key`, `key-refused`, `no-access`,
  `rate-limited` (with `retryAfter` when the source says), `invalid` (with the field) or `unavailable`. Only `invalid`
  is the asker's to fix. `no-key` tells an agent to carry on without the source, and isn't an error to the CLI or MCP.
- **Previews are a convenience.** An agent's search saves a smaller picture when the source has one (`Found.preview`,
  Unsplash's small size), stops reading one past 4 MB, keeps file names short, and lists a result whose preview failed
  with its link.

## Adding a connector

1. **Write the adapter** in `packages/connectors/src/<id>.ts`: its `info` (what it finds, which filters it takes, its
   limits, how it pages, and its `auth`: none, or a key and its variable), `search`, and `picked` when the source's
   terms ask to be told of each use. Its filters go in `info.filters`, each with the source's own values, so the adapter
   can send them as they come. `search` starts with `prepare`, which refuses a filter the connector doesn't take and
   says when there's no key, then sends with `sendSearch`, which turns a failed, slow or unreadable answer into a
   problem and reads how many searches are left. What's left is the adapter's own: its URL and request, its answer's
   schema, mapping a result to `Found`, and what each of the source's failures means, in words a person or agent can act
   on, never advice about the key, which only the app's owner can change. Test them with a stand-in `fetch`.
2. **Add it to `connectors`** in `packages/connectors/src/index.ts`. Main, `pnpm dev`, the window's list, recent
   searches and agents' search for its kind pick it up from there. A filter agents should know by name goes on its
   kind's contract in `packages/agent`, as an optional field named by the filter's id. A kind no agent call finds yet
   needs one: a contract, a `search…` in `utility/references.ts`, and its CLI command and MCP tool.
3. **Name its variable in `apps/desktop/.env.example`,** with where the app's owner gets a key.
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

What a review of the pattern found next, and what changed:

- **Keys are the owner's, not the person's.** The key file, setting and clearing a key, and `probe` are gone, with
  `connectors.storeFailed`. `auth` replaces `apiKey`.
- **One search shape per kind.** The agent contracts had Mobbin's and Unsplash's filters with their defaults, so a
  second screens source got `invalid`. Now the contracts leave defaults to the connector, and main routes by filter.
- **Check before routing.** Main checked a search only in the adapter, after choosing a connector and recording it.
- **Budget, and picks only of results given,** so nothing in the window or an agent's loop can spend a source's
  allowance or report uses Parity didn't have.
- **Recent searches** go through one interface, so the account's store can replace the file.

Still open: reporting an Unsplash photo when it's placed in a design. Nothing places photos yet; when something does,
Parity reports it through `picked` as the photo is written, whoever placed it.
