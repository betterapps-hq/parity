# Connectors

A connector brings things in from an outside service: screens from Mobbin, and photos and videos from Pixabay. This page
says how one is built and what adding the next one takes.

## How it fits together

```text
@parity-app/connectors        data in, data out: no Electron, no state, fetch passed in
├── connector.ts              the contract: requests, filters, auth, results, problems, checkRequest
├── browse.ts                 the window's library browser: shown filters, requests, pages, names, credit
├── recent.ts                 a recent search, and how one joins the list: remember
├── request.ts                what every adapter shares: prepare, sendSearch, notify, refusal
├── mobbin.ts                 Mobbin's REST API: screens, by platform and depth, paged by exclude
├── pixabay.ts                Pixabay's API: photos, illustrations, vectors and videos, by type and more, paged by page
├── unsplash.ts               Unsplash's API: photos, by orientation and color, paged by page, with placed; not offered
└── index.ts                  `connectors`, every one Parity has; `offered`, the ones main runs; and the key variables

@parity-app/service           Parity's service searching for the app: data in, data out, tested without a Worker
├── search.ts                 who may search, each limit, the day's cache and what each answer's status is
└── wire.ts                   the routes, and the answer that lists what the service searches

apps/portal                   the Worker at api.tryparity.dev
├── server/search.ts          Cloudflare's bindings and who sent a request, handed to @parity-app/service
└── routes/v1/connectors/     GET the connectors searched; POST {id}/search

apps/desktop
├── main/connectors.ts        the hub: keys, every search checked and budgeted, find, recent, placed, a service
├── main/placements.ts        placements counted as each source's usage, in <userData>/connector-placements.json
├── main/remote-search.ts     Parity's service as the hub's `SearchService`, as the signed-in person
├── main/search-history.ts    the person's recent searches, in <userData>/recent-searches.json for now
├── shared/connectors.ts      what the window sees and sends, checked with zod
├── utility/references.ts     agents' searches for screens and photos, through main, with previews saved
└── scripts/dev.ts            passes PARITY_*_KEY from .env.local to main
```

- **Keys are the app owner's.** People never enter one. A connector's `auth` says whether it needs a key and which
  variable a development copy sets it with (`PARITY_<NAME>_KEY`). Main reads them once and takes every such variable, in
  any letter case, out of its environment. A shipped copy has none and searches through Parity's service, which holds
  them as Worker secrets (PAR-131).
- **The window asks main over IPC:** `canvasHost.connectors` gets the list (each connector's details and whether this
  copy can search it, never a key), searches, lists the person's recent searches, and says a result was placed
  (`placed`). The library browser searches this way (editor.md), and adding a stock picture to the project reports each
  one placed, with `media` as its design, since the Media tab holds it rather than a design.
- **Main checks every search before it routes it,** against what the connector takes, and fills in its defaults. Each
  connector declares its source's `rateLimit` (Mobbin 60 a minute, Pixabay 100 a minute), and main runs half of it, so a
  loop can't spend a source's allowance. `connectors.searched` records the filters as checked, and names only connectors
  Parity has.
- **Agents search by kind, not by source.** `find_references` (`parity references`) finds screens and `find_media`
  (`parity media`) finds stock pictures and videos, by `type`: photos, illustrations, vectors or videos. Neither names a
  source in its description or examples. Each can name a `connector`; without one, main picks the first connector that
  finds the kind, takes every filter named and has a key. The contracts take filters as plain text by the connectors'
  ids and either way of asking for more (`exclude` or `page`), and main checks them against whichever connector runs the
  search, so a second source of the same kind with other values needs no change there. Each result names its connector.
  Searches give previews and ids, never an image link.
- **Recent searches go through a `SearchHistory`.** The hub adds each search that works in the window, never an agent's,
  with every filter it ran with, and `remember` keeps each connector's latest five. `localHistory` keeps them in a file
  for now; once Parity's service keeps them on the person's account, main passes the hub one that asks it.
- **Placing a result is Parity's own step, so Parity reports it.** An agent puts a picture in a design with
  `place_result` (`parity place <connector> <id> "<design/node>"`). In an image node, or a video node for a video, it
  sets `src`, `alt` and the author's `credit`, keeping the node's id and style; in a component it sets a prop the
  component declares. Only kinds in `placeableKinds` (photos, which covers illustrations and vectors, and videos) go in
  designs. A picture whose link expires, as Pixabay's do, is saved into `public/images/` first, as a pasted image is,
  and the node shows the file; a video is always saved, into `public/videos/`. Placing it again reuses the file. Once
  the edit applies, the hub's `placed` runs, only for a result it gave lately:
  1. counts it in a `PlacementLog` as the source's usage, once for each design, under a key that hashes the project,
     file and design so it holds no path. The account's store will replace the file;
  2. only when it's new, records `connectors.placed`;
  3. calls the connector's own `placed`, if it has one, which says whether the source took it. Unsplash's reports the
     photo to its download endpoint. One that didn't take it is tried again as Parity next starts.
- **Filters are data.** Each connector lists its filters in `info.filters`, with their values and defaults: Mobbin's
  platform and depth, Pixabay's type, orientation, color, footage, category, editor's choice and order. A search sends
  `filters: { platform: "ios" }`, `checkRequest` refuses a filter or value the connector doesn't list and fills in
  defaults, and the window can draw the controls from the list.
- **A filter can apply to some values of another.** Its `when` names them: Pixabay's orientation and color apply to
  photos, illustrations and vectors, and its footage (film or animation) to videos. `checkRequest` refuses one named
  where it doesn't apply and leaves out its default there, and `applies` tells the window whether to show it.
- **Offered, or only known.** `connectors` lists every connector Parity has, so a result or a project's image from one
  is named by `connectorById` even when it isn't searched. Main runs `offered`: Mobbin and Pixabay. Unsplash is kept but
  not offered.
- **Videos are results too.** A video's `Found` has kind `videos`, its poster in `image`, and its footage in `video`:
  the clip, its size, how long it runs, and a smaller clip for a list of results.
- **An answer says how many searches are left** when the source says, as `allowance`. `sendSearch` reads the
  `X-RateLimit-Remaining` and `X-RateLimit-Limit` headers, which Pixabay and Unsplash send and Mobbin doesn't.
- **A service can run searches for main.** The hub takes a `SearchService` that searches some connectors with keys of
  its own, with the hub's timeout. A connector with no key here goes to it, for searches and placements, and a key here
  still wins. Parity's own service is one (`main/remote-search.ts`, PAR-948): main asks it which connectors it searches
  as Parity starts, and sends each search with the signed-in person's WorkOS access token, renewing the token once when
  the service turns it down. Signed out, it answers `signed-out` without asking. An installed copy asks
  `api.tryparity.dev`, and a development copy with no key staging's Worker.
- **The service runs the same adapters** (`@parity-app/service`, `apps/portal`). It checks the token through Better
  Apps' WorkOS identity, allows each person 30 searches a minute and each source 50, keeps what a search found for 24
  hours in Workers KV under a hash of the search, and never keeps a problem, a query or who asked. Every answer is a
  `SearchAnswer`: 200 for results and for a problem the source gave, 401 for `signed-out`, 400 for `invalid`, 429 with
  `Retry-After` for its own limits, 404 for a connector it has no key for, and 503 when the source or its key fails.
- **A search never throws.** Its answer is what it found or a problem: `no-key`, `signed-out`, `key-refused`,
  `no-access`, `rate-limited` (with `retryAfter` when the source says), `invalid` (with the field) or `unavailable`,
  which is also what an adapter or service that throws gives. Only `invalid` is the asker's to fix. `no-key` and
  `signed-out` tell an agent to carry on without the source, and aren't errors to the CLI or MCP.
- **Previews are a convenience.** An agent's search saves a smaller picture when the source has one (`Found.preview`,
  Unsplash's small size), stops reading one past 4 MB, keeps file names short, deletes previews older than a week, and
  lists a result whose preview failed with its link.

## Adding a connector

1. **Write the adapter** in `packages/connectors/src/<id>.ts`: its `info` (what it finds, which filters it takes, its
   limits, its source's `rateLimit`, how it pages, and its `auth`: none, or a key and its `PARITY_<NAME>_KEY` variable),
   `search`, and `placed` when the source's terms ask for something when one of its results goes into a design. Its
   filters go in `info.filters`, each with the source's own values, so the adapter can send them as they come. `search`
   starts with `prepare`, which refuses a filter the connector doesn't take and, for a connector that needs one, says
   when there's no key, then sends with `sendSearch`, which turns a failed, slow or unreadable answer into a problem and
   reads how many searches are left. What's left is the adapter's own: its URL and request, its answer's schema, mapping
   a result to `Found`, and what each of the source's failures means, in words a person or agent can act on, never
   advice about the key, which only the app's owner can change. Test them with a stand-in `fetch`.
2. **Add it to `connectors`, and to `offered`** to search with it, in `packages/connectors/src/index.ts`. Main,
   `pnpm dev`, Storybook's live stories, the window's list, recent searches, placing and agents' search for its kind
   pick it up from there. Then check the words that name today's sources, which don't come from the connector:
   - a filter agents should know by name: an optional field on its kind's contract in `packages/agent/src/contracts.ts`,
     named by the filter's id, and its flag in `packages/cli/src/bin.ts` (the parse options, the command and the help);
   - the MCP tools' descriptions in `packages/cli/src/mcp.ts`, the result text in `packages/cli/src/client.ts`, and the
     tool table and steps in `packages/cli/skills/SKILL.md`, which name Mobbin and Unsplash;
   - a kind no agent call finds yet: a contract, a `search…` in `utility/references.ts`, its CLI command and MCP tool,
     and `placeableKinds` if results of that kind can go in designs.
3. **Name its variable in `apps/desktop/.env.example`,** with where the app's owner gets a key.
4. **Try it live** with a key in `apps/desktop/.env.local`, from a script that reads the file and never prints the key.
5. **Record the source's terms** in its adapter's header comment: credit, caching, what it must be told, and its limits.

## Pattern changes made

What adding Unsplash after Mobbin showed, and what changed for each:

- **Filters are data.** Before, each new filter widened the shared request, `ConnectorInfo` and `checkRequest`. Unsplash
  added `orientation`, `color` and `page`. Now a connector lists its filters, and nothing shared changes for a new one.
- **One agent call per kind.** Before, `find_references` was Mobbin's screens, and agents couldn't search photos. Now
  `find_media` (first called `find_photos`) finds stock pictures and videos, and each call reaches whichever connector
  finds its kind.
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
- **A budget, and placements only of results given,** so nothing in the window or an agent's loop can spend a source's
  allowance or report uses Parity didn't have.
- **Recent searches** go through one interface, so the account's store can replace the file.
- **Placing is a step of its own.** `picked` became `placed`, called by the hub after it counts a placement, and agents
  place with `place_result` instead of pasting an image link, so a use is reported because Parity made it.

What a second review found, and what changed:

- **Placing fills Parity's own image node.** `Update` couldn't change an image's picture, so `place_result` changed
  nothing there. Now `Update` takes `src`, `alt` and `credit` for an image, and placing checks its target first: an
  image, or a component's declared prop.
- **Usage is keyed without paths,** by a hash of the project, file and design, so two designs with the same id in
  different files count apart and an account's store learns nothing about the computer.
- **A connector that needs no key searches,** where `prepare` refused it.
- **Each source's own rate limit,** instead of one budget a minute for all.
- **Reports are retried.** A source that didn't take one hears of it again as Parity starts.
- **The rule for what goes in designs is shared,** in `placeableKinds`, and main enforces it for the window too.

What adding Pixabay in place of Unsplash showed, and what changed:

- **What to find can be a filter.** Pixabay searches photos, illustrations, vectors and videos apart. Its `type` filter
  says which, with photos by default, and a search for the `videos` kind is one for that type.
- **Filters that apply to some types,** with `when`, so the window hides the ones that don't and a search can't name
  them.
- **Videos,** as a kind and as `Found.video`.
- **Offered apart from known,** so a source can stop being searched and its results still be named.

- **Agents' calls name no source,** and say pictures rather than photos: `find_photos` became `find_media`
  (`parity media`), with a `type` filter for photos, illustrations, vectors or videos. Videos were found but, like
  screens, only for looking at, until the video layer (PAR-841) let them be placed.
- **Placing saves a picture whose link expires** into the project, since Pixabay's links last 24 hours and may only show
  results.

Still open: the window has no Place for pictures yet, so only agents place them today. Pixabay's terms ask for each
search's answer to be kept for 24 hours, which Parity's service does for every installed copy (PAR-131); a development
copy searching with its own key keeps none.
