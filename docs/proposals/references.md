# Proposal: design references and stock media, in one browser

Status: approved 2026-11-10 (PAR-827), being built. The connectors are built (PAR-829, PAR-837), and so is the Media tab
(PAR-838, [its stories](../../apps/desktop/src/renderer/media/MediaPanel.stories.tsx)); stock media and videos in it
follow. The browser is designed, not built. Its design is the exploration under Parity/Explorations/References, one set
of stories for each library: [Mobbin](../../apps/desktop/src/renderer/explorations/references/Mobbin.stories.tsx),
[Pixabay](../../apps/desktop/src/renderer/explorations/references/Pixabay.stories.tsx) and
[Unsplash](../../apps/desktop/src/renderer/explorations/references/Unsplash.stories.tsx).

## In one line

Searching a library outside the project happens in one wide browser over the canvas, whichever library it is. Find
references searches Mobbin's screens from real apps and places what you pick beside your design to look at, never in it.
Add, in the Media tab, searches Pixabay's photos, illustrations, vectors and videos and adds what you pick to the
project. Each library is a connector, and the browser draws its filters from what the connector says it takes. Agents
search the same connectors. Both run on Parity's own keys, so nobody needs an account with either. Mobbin's terms allow
its API inside a product, and I'd still get its yes in writing before this reaches anyone outside the team.

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
| `exclude_screen_ids`, up to 100                    | More as you scroll: the same description, without the screens shown   |
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
  Images tab; they move to the browser, and the tab becomes the project's own media.
- **Each library is a connector** (`packages/connectors`, PAR-829), and the browser is one component for all of them. It
  reads the connector's own description rather than knowing each source.
- **The source's name and mark come from its connector,** as `name`, `site` and `mark`, and sit at the foot of the
  browser as a link to the source. The mark is one path, drawn in the text's color, so it reads in both themes.
- **Filters come from the connector's `filters`.** Every filter today is one choice from a fixed list, so there's one
  data type, and the browser picks between three controls from the list's shape. A filter with one value is on or off,
  as Pixabay's editor's choice is. One that always has a value, between a few, is a switch, as Mobbin's platform is. Any
  other is a select, starting on "Any" when it can be left open, as Unsplash's orientation and color are. A value can
  carry a `swatch` or name an `icon`, which shows beside its name wherever the value appears: in the control, and on a
  recent search. A new filter on a connector shows up without a change to the browser. A filter that isn't a choice,
  such as a number or free text, would need the connector to say its type, which it doesn't yet.
- **Three filters sit beside the search field, and the rest are behind Filters,** in the connector's order, which is
  most used first. The button counts how many of its filters are set. Pixabay has seven, so it's the first to need this.
- **A filter can depend on another's choice,** through its `when`. Pixabay's orientation and color are for pictures and
  its footage is for videos, so choosing Videos swaps which sit beside the search field.
- **Unsplash's colors are a fixed list.** Its API takes eleven named colors and nothing else, so there's no picking your
  own.
- **Mobbin's depth is the one filter the browser treats by name:** it's offered as Search deeper on the results rather
  than as a choice before searching.
- **Guidance on searching comes from the connector's `guide`:** a few example searches and a few tips, from the source's
  own documentation. The browser offers the examples to run before a search and uses the first in the search field. The
  tips sit behind Tips, a button in the search field, in every state, since they're most use when a search has come back
  thin. Agents can be given the same words.
- **More results load as you scroll,** the way the connector's `more` says: leaving out what's shown for Mobbin, the
  next page for Unsplash and Pixabay. Each result goes to whichever column is shortest, so a new page never moves an
  earlier one, and only the results in view are drawn (TanStack Virtual, which the insert picker already uses), since a
  Pixabay search can run to 500. A deep Mobbin search doesn't load more by itself, since each page is one Mobbin charges
  for: it keeps a More results button.
- **A connector's problems are the browser's states:** no key, a key turned down, a plan without access, a limit reached
  with the wait counted down, a search it can't take, and a source that can't be reached.
- **A limit shows only once it's reached,** as the "Too many searches right now" state. Unsplash sends how many searches
  remain in the hour with every answer, 50 an hour until it approves an app for production and 5,000 after, which the
  connector passes on as `allowance`. The browser doesn't show the count.
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
- **More results load as you scroll toward the end,** without the screens already shown. When a pull comes back short
  there are no more, and the browser says to describe it another way.
- **When a search can't answer** it says which thing happened: nothing matches, with a button to try the other platform;
  a deep search found no close matches, with the way back to the quick ones; Mobbin's limit, with the wait; Mobbin can't
  be reached; or this copy of Parity has no key for it, where the browser says Mobbin isn't available, in the
  connector's own words. A key is the app owner's to arrange, so there's nothing for the person to set up.
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

### Stock media from Pixabay

- **Pixabay is the stock library** (decisions.md, "Pixabay finds photos in place of Unsplash"). Unsplash's connector and
  its stories are kept, and it isn't offered. Turning it on later is one line, since the browser is the same.
- **Add, beside the Media tab's search, opens it,** as "Find on Pixabay" under Pixabay's own mark, above "Choose files".
  Searching the project's media for something it doesn't have offers to look for the same words on Pixabay.
- **It's the same browser.** Results come in every shape, so they pack into columns, each with its contributor's name
  under it. Type, orientation and color sit beside the search field, and category, editor's choice and order are behind
  Filters. Vectors show on checks, so you can see they're see-through.
- **Videos are the fourth type.** A result says how long it runs and plays, without sound, while pointed at. Shown
  larger, it plays in a player with a scrubber. The player in the stories is a stand-in, the kit's slider under a plain
  video; which player to use is under Still to decide.
- **The button adds what's picked to the project:** "Add 3 to project". Pixabay's links last a day and its terms ask
  that pictures aren't loaded from them, so each one is saved as a file, keeping its contributor's name and its page on
  Pixabay.
- **Where something is from is the connector's to say.** A result carries its connector's id, and the connector has the
  name and the mark, so the Media tab and the inspector name the source without knowing the libraries.

### The Media tab

- **It's the Images tab, renamed,** since what a project keeps is no longer only images. Today the tab is a placeholder,
  and something you've added can't be seen or used again.
- **It's a wall of the pictures themselves:** two across, each in its own proportions, in whichever column is shorter,
  with nothing written under them. A picture says what it is faster than its file's name does, and a 256 pixel panel has
  room for one or the other. Pointing at one shows its name over its foot.
- **What needs saying about one is on it:** a video's length, a mark on a picture a layer links to rather than a file
  the project keeps, and a dashed place, with the file's name, for a path a layer names that has no file.
- **Resting on one opens its card,** as a component's does, and the right arrow opens it from the keyboard: the picture
  larger, or a video in its player; its name and where its file is; its size in pixels and on disk; who made it and the
  library it's from, under that library's mark; where it's used; and Insert, Open in Pixabay and Remove.
- **Where it's used is listed by design, not by layer,** since a logo can be in a hundred layers and they're in a
  handful of designs. Each design's row says how many of its layers use it, with Show, the one with the most first, then
  each line of code. Three rows show, and the rest open in place behind "Show 11 more", in a list that scrolls. The
  dialog that asks before removing one lists them the same way.
- **Pressing one places it in the selected design, and it drags onto the canvas,** as a component does. Dropped on a
  design it lands where it's dropped; on the empty canvas it makes a frame named after it.
- **Images, Vectors and Videos narrow it,** and show only when the project has more than one of them. Its search looks
  through the project's own, by file name, by who made it, and by what a stock picture shows.
- **Files dragged onto it are added to the project** (PAR-835), and removing one asks first when a layer or the code
  still uses it (PAR-836).
- **It tracks files, not searches.** What you searched for isn't kept beyond the browser's Recent list.

### For agents

- **A `find_references` tool** beside `screenshot`, taking what the API takes: a description, a platform, the mode and a
  limit of 10 unless told otherwise. It returns each screen's app, platform, link and id as text, with the pictures as
  images the agent can look at. `find_media` does the same for stock pictures and videos. Both are built (PAR-829,
  PAR-837).
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
- **Each library's Live story searches the real one.** Storybook's dev server runs the connectors with the keys in
  `apps/desktop/.env.local` (`.storybook/connectors.ts`), as main does for the window, so a key never reaches the page.
  The stories' host asks it at `/__connectors`.
- **A built Storybook has no server,** so there the live stories show the "isn't available" state. The pull request's
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
- **Recent searches are kept for the person, by main,** which adds each search that works in the window: the last five
  descriptions for each library, each with every filter it last ran with. For now they're in a file in the app's data
  (`recent-searches.json`); once Parity's service keeps them on the person's account, main asks it instead and the
  window doesn't change. They aren't in the project, so they're not shared or committed. Agents' searches aren't kept.
  In the exploration they last only until the story reloads.

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
- **Which video player.** I'd add Kibo UI's video player, a shadcn registry component of about a hundred lines over
  `media-chrome` (MIT, one dependency), which has play, a scrubber, the time, mute and volume, and takes the kit's
  colors. `media-chrome` would be a new dependency, so it waits for your yes.
- **What a video is on the canvas.** Placing one from the Media tab shows its first frame, as an image. Whether a design
  can hold a playing video, and what that is in the project's code, isn't designed.
- **Where video files are kept.** Images go in `public/images`, as `images.import` saves them. The stories keep videos
  in `public/videos` beside it, which nothing has decided.
- **A sharper picture for the larger view and the canvas.** The Mobbin connector asks for the API's `optimized`
  pictures, 768 pixels wide for a web screen in the searches I ran. The API's `high` would suit a reference at its own
  size.
- **Refero as a second source.** Its screens come with written details, such as page type, patterns and fonts, which
  would give this browser real filters. It's also the only library whose terms describe a plan for putting it in a
  product.
