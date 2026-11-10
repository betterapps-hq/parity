# Proposal: design references and stock photos, in one browser

Status: draft, second pass, 2026-11-09 (PAR-827). Nothing is built. The design is the exploration under
Parity/Explorations/References
([References.stories.tsx](../../apps/desktop/src/renderer/explorations/references/References.stories.tsx)).

## In one line

Searching a library outside the project happens in one wide browser over the canvas, whichever library it is. Find
references searches Mobbin's screens from real apps and places what you pick beside your design to look at, never in it.
Find photos searches Unsplash and adds what you pick to the project. Each library is a connector, and the browser draws
its filters from what the connector says it takes. Agents search the same connectors. Both run on Parity's own keys, so
nobody needs an account with either. Mobbin's terms allow its API inside a product, and I'd still get its yes in writing
before this reaches anyone outside the team.

## What changed from the first pass

- **There's no References tab.** The left panel is about 280 pixels wide, where a web screenshot can't be read, and it
  would have been a sixth tab. Looking for references starts from a design, so it starts there, and it opens wide.
- **The filters are the API's.** The first pass had Screens, Flows and Sections beside Web and iOS. Flows and sections
  are tools of Mobbin's MCP server only. The REST API has one endpoint, which searches screens, with the platform as its
  one filter.
- **Parity's key comes first,** as you asked, with each person's own Mobbin account as the fallback rather than the
  start.

## What the API takes

`POST https://api.mobbin.com/v1/screens/search` is the whole REST API
([reference](https://docs.mobbin.com/api-reference/screens/search-screens-with-natural-language.md)). It needs a Team or
Enterprise plan, and its key belongs to a workspace.

| The API                                            | In Parity                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `query`, 1 to 500 characters describing one screen | The description field                                                 |
| `platform`, `ios` or `web`, required               | Web or iOS, starting from the selected design                         |
| `mode`, `standard` or `deep`, `deep` when left out | Quick results first, and Search deeper for `deep`                     |
| `limit`, 1 to 100, 20 when left out                | 24 a search (9 for the web and 12 for iOS in the exploration)         |
| `exclude_screen_ids`, up to 100                    | More results: the same description, without the screens shown         |
| `image_quality`, `optimized` or `high`             | `optimized` in the results, `high` shown larger and on the canvas     |
| Returns `id`, `app_name`, `platform`, `mobbin_url` | The app's name under each screen, and Open in Mobbin                  |
| Returns `image` with its size and `url_expires_at` | A reference's size on the canvas, and when to fetch its picture again |
| 429 with `Retry-After`, at 60 requests a minute    | "Too many searches right now", with the wait counted down             |
| 403 without a Team or Enterprise plan              | Nobody using Parity sees this; the service reports it to us           |

Two things the description does by itself, so they need no control: naming an app keeps the results to that app, and
naming a language keeps them to that language.

**What it doesn't have:** flows, website sections, categories, patterns or tags to filter by, Android, saved
collections, paging, or a way to fetch one screen by its id. The design offers none of them.

## One browser for outside libraries

- **The left panel holds what's in the project; the browser searches what's outside it.** Layers, components, icons,
  images and tokens are the project's own, small and known, and they stay in the panel. Judging strangers' pictures
  needs room and is a short task, find, pick, done, so it gets the wide browser. Stock photos were planned for the
  Images tab; they move to the browser, and the tab becomes the project's images.
- **Each library is a connector** (`packages/connectors`, PAR-829), and the browser is one component for all of them. It
  reads the connector's own description rather than knowing each source.
- **The source's name and mark come from its connector,** as `name`, `site` and `mark`, and sit at the foot of the
  browser as a link to the source. The mark is one path, drawn in the text's color, so it reads in both themes.
- **Filters come from the connector's `filters`.** Every filter today is one choice from a fixed list, so there's one
  data type, and the browser picks between two controls from the list's shape. A filter that always has a value, between
  a few, is a switch, as Mobbin's platform is. One that can be left open is a select starting on "Any", as Unsplash's
  orientation and color are. A value can carry a `swatch` or name an `icon`, which shows beside its name wherever the
  value appears: in the control, and on a recent search. A new filter on a connector shows up without a change to the
  browser. A filter that isn't a choice, such as a number or free text, would need the connector to say its type, which
  it doesn't yet.
- **Unsplash's colors are a fixed list.** Its API takes eleven named colors and nothing else, so there's no picking your
  own.
- **Mobbin's depth is the one filter the browser treats by name:** it's offered as Search deeper on the results rather
  than as a choice before searching.
- **Guidance on searching comes from the connector's `guide`:** a few example searches and a few tips, from the source's
  own documentation. The browser offers the examples to run before a search and uses the first in the search field. The
  tips sit behind Tips, a button in the search field, in every state, since they're most use when a search has come back
  thin. Agents can be given the same words.
- **More results follows the connector's `more`:** leaving out what's shown for Mobbin, the next page for Unsplash.
- **A connector's problems are the browser's states:** no key, a key turned down, a plan without access, a limit reached
  with the wait counted down, a search it can't take, and a source that can't be reached.
- **Searches left show when the connector says.** Unsplash sends how many remain in the hour with every answer, in its
  rate limit headers, which the connector passes on as `allowance`: 50 an hour until Unsplash approves an app for
  production, then 5,000. Under ten, the browser says so beside the credit. Mobbin doesn't say until it's too late.
- **What differs for each library is small:** its name and the words around the search field, whether results sit in
  rows or pack into columns, and what the button does with what's picked.

## Where it shows

### Finding references

- **Find references is on the toolbar,** after the review tools, with R as its key. It's also in a design's right-click
  menu and in Search actions.
- **With a design selected it opens already searched:** the design's name as the description ("pricing page"), on the
  web when the design's main preview is wider than 600 pixels and on iOS otherwise. That first search is a quick one.
- **With nothing selected it opens on the last few searches** to run again, one for each description, beside the example
  searches from the connector. Each recent search says what it was narrowed by: the value of every filter that always
  has one, so every Mobbin search shows Web or iOS, then any other that was chosen, so an Unsplash search shows its
  orientation or color only when one was picked.
- **A search runs on Enter,** not as you type, since each one is a request to Mobbin. Switching between Web and iOS runs
  the same description again.

### The browser

- **It's a wide dialog over the canvas,** up to 1,120 pixels, so web screens sit three across at about 340 pixels each
  and phone screens six across. Each has its app's name under it.
- **Quick results come first, and Search deeper is asked for.** A quick search returns everything near the description,
  the closest first. Search deeper runs it in the API's `deep` mode, which checks each screen against the description
  and keeps the close matches, so it takes a few seconds and can return fewer screens. My call: quick is the default
  although the API's is `deep`, because deep is the search Mobbin charges for.
- **A click picks a screen, and picks carry across searches,** so you can gather a web page and a phone paywall in one
  go. The button says how many: "Place 3 on canvas". Ctrl+Enter places them too.
- **A double-click, or a screen's corner button, shows it larger,** in place of the search and its results. Its bar has
  the app's name, its platform as a badge, Open in Mobbin, Pick, and an X that closes it, as Esc does. A strip of every
  result runs underneath, the current one outlined and the picked ones checked, and a click or the arrow keys moves
  through them.
- **More results** asks again without the screens already shown. When a pull comes back short there are no more, and the
  browser says to describe it another way.
- **When a search can't answer** it says which thing happened: nothing matches, with a button to try the other platform;
  a deep search found no close matches, with the way back to the quick ones; Mobbin's limit, with the wait; Mobbin can't
  be reached; or the connector isn't set up, in the connector's own words.
- **Mobbin's mark and name sit at the foot of the browser,** as a link to mobbin.com, so the source is always named. The
  mark is drawn in the text's color, so it reads in both themes. Mobbin's terms don't ask for a credit. I've kept one
  because the screens are theirs to show, each reference on the canvas already says "Mobbin", and it's the first thing
  they'd ask for when we ask to ship this.

### On the canvas

- **References land in a row beside the design** they were found for, or in the middle of the view when there wasn't
  one, and the canvas fits them in. A later batch starts a new row under the last.
- **A reference is a canvas item, not a design.** It has no board, states, modes or layers, it isn't in Layers, and it's
  never written to code. Each is its picture at its own size, with its app's name and "Mobbin" under it.
- **Selecting one shows it in the inspector's Design tab,** as a selected note is: where it's from, its platform, the
  description that found it and who placed it, with Open in Mobbin, More from that app, and a note for why it's here.
- **It can be moved and deleted,** and a double-click opens it in Mobbin. It can't be pasted into a design, and an image
  layer can't take its picture.
- **Exports leave references out,** so a design's PNG is the design alone.

### Photos from Unsplash

- **Find photos is in the Images tab,** as a button under its search. Searching the project's images for something it
  doesn't have offers to look for the same words on Unsplash.
- **It's the same browser.** Photos come in every shape, so they pack into columns, each with its photographer's name
  under it. Orientation and color sit beside the search field, each on "Any" until chosen, and changing one searches
  again. Unsplash's mark and name sit at the foot.
- **The button adds what's picked to the project:** "Add 3 photos". They go where dropped image files go (PAR-24): into
  the selected layout, or onto a new screen when nothing's selected. Each one shows in the Images tab from then on.
- **Each photo used is reported to Unsplash,** and keeps its photographer's name and its Unsplash link, as Unsplash's
  terms ask (decisions.md, "Unsplash is the first stock source"). The connector's `picked` does the report.

### The Images tab

- **It lists the project's own images:** every file in its images folder, whether pasted, dropped or added from
  Unsplash. Today the tab is a placeholder, and an image you've added can't be seen or used again.
- **Each has its file's name, and how it got there:** "Photo by" and the photographer for one from Unsplash, with a link
  to it there; "Pasted" or "Dropped in" otherwise.
- **Its search looks through the project's images,** by file name and, for a photo, what it shows.
- **It tracks files, not searches.** What you searched for isn't kept beyond the browser's Recent list.

### For agents

- **A `find_references` tool** beside `screenshot`, taking what the API takes: a description, a platform, the mode and a
  limit of 10 unless told otherwise. It returns each screen's app, platform, link and id as text, with the pictures as
  images the agent can look at. `find_photos` does the same for Unsplash. Both are built (PAR-829).
- **`PlaceReference(id, { near, note })` in `execute`** puts one beside a design with a note on what the agent took from
  it. The story Placed by an agent shows what's left behind: the screens it looked at, each saying why.
- **The skill carries Mobbin's own rules for a good search:** one screen per search, at most three details, the platform
  as the parameter and never in the description, quick when the description has no details and deep when it has, and
  check the app's name before saying whose screen it is.
- **And Parity's rule for what to do with them:** say which patterns you're following, and build them from the project's
  own components and tokens. Never copy another app's layout, text or branding.

## In Storybook

- **Most stories search made-up samples** that answer in the connectors' own types, so the browser is the same code
  against samples as against the real thing, and the stories look the same everywhere.
- **Live Mobbin and Live Unsplash search the real libraries.** Storybook's dev server runs the connectors with the keys
  in `apps/desktop/.env.local` (`.storybook/connectors.ts`), as main does for the window, so a key never reaches the
  page. The stories' host asks it at `/__connectors`.
- **A built Storybook has no server,** so there the live stories show the "isn't set up" state. The pull request's
  preview is one of those.
- **Stories never report a photo as used,** since they place nothing for real.

## Accounts and cost

### Parity's key, through Parity's service

- **A service of Parity's holds the key** and answers the app's and agents' searches, as the stock photo service will
  for Unsplash (PAR-131). The key never ships in the app.
- **It needs a Parity sign-in,** so the service can tell people apart. The key's 60 requests a minute are shared by
  everyone, so the service gives each person a share and answers repeated searches from memory for a few minutes, if
  Mobbin's terms allow that.
- **What a search costs us isn't settled.** Mobbin's docs say API usage doesn't draw on a plan's AI credits and that API
  pricing "will be handled separately". Its terms say API calls use AI credits, more for an "advanced" call than a
  "standard" one. Either way deep costs more, so deep searches may need a daily allowance per person.
- **The terms allow putting the API in a product, within limits.** They permit "integration into your own proprietary
  products or services", and forbid reselling, sublicensing or leasing access to the API, building something that
  competes with Mobbin, and making a standalone library from its content ([Terms](https://mobbin.com/terms), section 3).
  Find references is the first and none of the last three, as I read it.
- **I'd still get Mobbin's yes in writing before it ships.** One key answering every Parity user's searches is close
  enough to leasing access that it shouldn't rest on my reading, and the 60 requests a minute need raising anyway. What
  to ask for is in [Questions for Mobbin](#questions-for-mobbin).

### The fallback: each person's own Mobbin account

If Mobbin won't agree, the same browser can run on each person's account through Mobbin's MCP server, which is built for
that ([Build an integration](https://docs.mobbin.com/mcp/build-an-integration.md)).

- **It adds a Connect Mobbin step,** with OAuth in the browser, and needs the person to be on Mobbin's Pro, Team or
  Enterprise plan.
- **Deep searches would draw on the person's AI credits:** 5 a search, from 300 a month on Pro and 600 a member on Team,
  and at most 500 deep searches a day. Mobbin isn't enforcing the allowance during a beta that began on 12 October 2026
  and is expected to run about six months.
- **It would add flows and sections,** which only the MCP server has. They'd be designed then, not now.

## What's kept

- **A reference keeps its Mobbin id, app, platform, link, size, place, the description that found it and its note,** in
  the designs file with the canvas's other items. It isn't saved into `public/images/`.
- **Its picture is the open problem.** Mobbin's image links expire, about 30 days out, and the API can't fetch a screen
  by its id. So either Parity keeps a copy of a placed reference's picture, which needs Mobbin's say-so, or it finds the
  screen again by searching for its app and matching the id. Until that's settled, a reference whose picture has expired
  shows its app's name and Open in Mobbin.
- **Recent searches are kept on this computer, for the person,** in the app's own preferences beside the panel layout:
  the last five descriptions for each library, each with the filters it last had. They aren't in the project, so they're
  not shared or committed, and nothing is sent anywhere until one is run again. In the exploration they last only until
  the story reloads.

## The spike

A Mobbin Team plan with one seat, $72 for 3 months, and an API key from Settings, used only on your machine.

- Call the endpoint from the main process and show real results in the browser built from this exploration.
- Time `standard` against `deep`, and compare what they return for the same descriptions, to check that quick first is
  the right default.
- See how far `url_expires_at` is from now, and what sizes `optimized` and `high` give.
- Try finding a placed screen again by its app's name, for refreshing a picture.
- Run the agent tool against it and see whether an agent's designs get better for having looked.

Only your team sees results during the spike, which a Team plan covers.

## Questions for Mobbin

In this order, since the first decides whether the rest matter:

1. **Confirming that one key serving every Parity user is "integration into your own product"** under the terms, and not
   leasing access.
2. **Keeping a placed reference's picture** past its link's expiry, or a way to fetch a screen by its id.
3. **What API usage costs,** per search, and whether deep costs more.
4. **A higher limit** than 60 requests a minute for the workspace.
5. **How Mobbin wants to be credited,** and whether we may show its mark, in the browser and on the canvas.
6. **Whether flows, sections and Android are coming to the REST API.** It searches iOS and the web today.

## Still to decide

- **Whether references belong to a project or to the person.** This proposal keeps them in the project's designs file,
  so everyone on the project sees them and they're in the repository. A person-only board would keep them out.
- **Whether Find references earns a place on the toolbar,** which I've given it, or lives only in the right-click menu,
  Search actions and R.
- **A list of placed references.** Nothing lists them, so they're found only by seeing them on the canvas. A References
  group at the foot of Layers would do it without a new tab.
- **Whether an added photo is a file in the project or a link to Unsplash.** Unsplash's terms ask that photos load from
  its own links. The mock says a photo goes into the project's images without settling which.
- **A sharper picture for the larger view and the canvas.** The Mobbin connector asks for the API's `optimized`
  pictures, 768 pixels wide for a web screen in the searches I ran. The API's `high` would suit a reference at its own
  size.
- **Refero as a second source.** Its screens come with written details, such as page type, patterns and fonts, which
  would give this browser real filters. It's also the only library whose terms describe a plan for putting it in a
  product.
