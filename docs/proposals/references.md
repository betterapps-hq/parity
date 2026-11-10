# Proposal: design references from Mobbin

Status: draft, second pass, 2026-11-09 (PAR-827). Nothing is built. The design is the exploration under
Parity/Explorations/References
([References.stories.tsx](../../apps/desktop/src/renderer/explorations/references/References.stories.tsx)).

## In one line

Find references opens a browser over the canvas. You describe a screen, choose Web or iOS, pick from real apps' screens
on Mobbin, and they land beside your design to look at, never in it. Agents search the same way before they design. It
runs on Mobbin's REST API with Parity's own key, so nobody needs a Mobbin account. Mobbin's terms allow its API inside a
product, and I'd still get its yes in writing before this reaches anyone outside the team.

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

## Where it shows

### Finding references

- **Find references is on the toolbar,** after the review tools, with R as its key. It's also in a design's right-click
  menu and in Search actions.
- **With a design selected it opens already searched:** the design's name as the description ("pricing page"), on the
  web when the design's main preview is wider than 600 pixels and on iOS otherwise. That first search is a quick one.
- **With nothing selected it opens on the last few searches** to run again, and three lines on describing a screen, from
  Mobbin's own guidance: say what kind of screen it is and then what's on it, name an app to see only that app, and
  search for one screen at a time.
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
- **When a search can't answer** it says which of four things happened: nothing matches, with a button to try the other
  platform; a deep search found no close matches, with the way back to the quick ones; Mobbin's limit, with the wait; or
  Mobbin can't be reached.
- **Mobbin's mark and name sit at the foot of the browser,** as a link to mobbin.com, so the source is always named.
  Mobbin's terms don't ask for a credit. I've kept one because the screens are theirs to show, each reference on the
  canvas already says "Mobbin", and it's the first thing they'd ask for when we ask to ship this.

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

### For agents

- **A `find_references` tool** beside `screenshot`, taking what the API takes: a description, a platform, the mode and a
  limit of 10 unless told otherwise. It returns each screen's app, platform, link and id as text, with the pictures as
  images the agent can look at.
- **`PlaceReference(id, { near, note })` in `execute`** puts one beside a design with a note on what the agent took from
  it. The story Placed by an agent shows what's left behind: the screens it looked at, each saying why.
- **The skill carries Mobbin's own rules for a good search:** one screen per search, at most three details, the platform
  as the parameter and never in the description, quick when the description has no details and deep when it has, and
  check the app's name before saying whose screen it is.
- **And Parity's rule for what to do with them:** say which patterns you're following, and build them from the project's
  own components and tokens. Never copy another app's layout, text or branding.

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
- **Searches aren't kept,** apart from the last five on this computer, for the browser's Recent list.

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
6. **Whether flows and sections are coming to the REST API.**

## Still to decide

- **Whether references belong to a project or to the person.** This proposal keeps them in the project's designs file,
  so everyone on the project sees them and they're in the repository. A person-only board would keep them out.
- **Whether Find references earns a place on the toolbar,** which I've given it, or lives only in the right-click menu,
  Search actions and R.
- **Refero as a second source.** Its screens come with written details, such as page type, patterns and fonts, which
  would give this browser real filters. It's also the only library whose terms describe a plan for putting it in a
  product.
