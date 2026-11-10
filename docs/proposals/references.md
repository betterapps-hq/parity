# Proposal: design references from Mobbin

Status: draft, 2026-11-09 (PAR-827). Nothing is built. The design is the exploration under
Parity/Explorations/References
([References.stories.tsx](../../apps/desktop/src/renderer/explorations/references/References.stories.tsx)).

## In one line

A References tab searches real apps' screens, flows and sections on Mobbin. A reference you pick goes on the canvas
beside your designs to look at, and never into a design or the project. Agents search the same library before they
design. Each person connects their own Mobbin account at first. Parity's own key, held by a service as the Unsplash key
will be, comes only once Mobbin agrees to it in writing.

## Why Mobbin

You asked on 2026-11-09 for a library agents can search for design examples, and compared Mobbin, Refero and Lazyweb.

- **Mobbin is the biggest library of real apps,** with screens, multi-step flows and website sections, on iOS and the
  web. Third-party estimates put it at about 1,500 apps and over 300,000 screens.
- **It's built for apps to connect to.** Its MCP server lets an app connect on each person's behalf with OAuth and
  dynamic client registration, with no fee for the app and nothing to set up with Mobbin first
  ([Build an integration](https://docs.mobbin.com/mcp/build-an-integration.md)).
- **Refero is the second source to add.** Each screen there comes with written details: its page type, UX patterns, UI
  elements, fonts and colors, and its styles describe a page's type scale, spacing and colors as data. That's more for
  an agent to reason over than Mobbin's pictures. It's the only library whose terms describe a business plan for putting
  it in a product ([Terms of Use](https://doc.refero.design/legal/terms-of-use)), so it may be the first one Parity can
  offer without each person needing an account.
- **Neither has desktop or creative tools.** Both are web and iOS apps. For an editor's panels and canvas controls,
  Penpot and Figma stay the references.

## Where it shows

### A References tab in the left panel

My call: references get a tab of their own after Images, rather than a part of the Images tab. Images holds photos that
go into designs and are saved with the project; references are for looking at and stay out of designs. Mixing them would
blur which one ends up in the code.

The tab, top to bottom:

- **Search,** in plain words, as Mobbin's search takes them: "onboarding for a budgeting app", "pricing page with a
  yearly toggle".
- **What to find:** Screens, Flows or Sections, as Mobbin's three searches. Sections are web only.
- **Where:** Web or iOS. It starts on Web when the project's primary mode is wider than 600 pixels, and iOS otherwise,
  and remembers the choice per project.
- **Results,** as a grid that fits the panel: wide thumbnails for the web, tall ones for iOS, each with the app's name
  under it. Hovering one shows Place on canvas and Open in Mobbin.
- **A flow opens in place,** its steps in order with each step's caption, and Back to results above them. Each step can
  be placed by itself, or the whole flow in a row.
- **"From Mobbin"** and the account's menu sit at the foot of the panel, so the source is always named.

### On the canvas

- **Dragging a result onto the canvas, or Place on canvas, puts a reference there.** Place on canvas puts it to the
  right of the selected design, or in the middle of the view when nothing is selected. A flow placed whole is a row of
  references, one per step.
- **A reference is a canvas item, not a design.** It has no board, states, modes or layers, and it's never written to
  code. Layers lists references together in their own group under the designs.
- **It's labeled with its app and source** under the image, in the canvas's quiet caption type, and a double-click opens
  it in Mobbin.
- **It can be moved, resized, kept to its aspect ratio, and deleted.** It can't be pasted into a design, and an image
  layer can't take a reference's image.
- **Exports leave references out,** so a design's PNG is the design alone.

### For agents

- **A `find_references` tool** beside `screenshot`: a search, the kind (screens, flows or sections), the platform, and a
  limit of 10 by default. It returns each result's app, platform, link and id as text, with the previews as images the
  agent can look at, as `screenshot` returns renders.
- **`PlaceReference(id, { near })` in `execute`** puts one on the canvas beside a design, so the person sees what the
  agent based a design on.
- **The skill says to look first.** Before designing a screen of a common kind (onboarding, pricing, settings, a
  checkout), search for a few, say which patterns you're following, and build them from the project's own components and
  tokens. Never copy another app's layout, text or branding.
- **Searches count against the person's own Mobbin limit,** the same 60 requests a minute and 500 deep searches a day,
  so an agent searches once per screen, not once per element.

## Accounts

### First: each person's own Mobbin account

- **Connect Mobbin** in the tab opens Mobbin's sign-in in the person's browser, as Parity's own sign-in does
  ([sign-in.md](sign-in.md)). Parity registers itself as a client with dynamic client registration, so there's no client
  ID to manage.
- **Main keeps the tokens,** encrypted with the system keychain through Electron's `safeStorage`, in the app's data,
  never in a project. It refreshes them, and only main calls Mobbin.
- **Main calls Mobbin's MCP server** (`https://api.mobbin.com/mcp`) with the person's token, and the window asks main
  through the project service. The window never sees a token.
- **Mobbin's MCP needs a Pro, Team or Enterprise plan.** Someone on Mobbin's free plan can connect, but searching says
  their plan doesn't include it, with a link to Mobbin's plans.

### Later: Parity's own key, after an agreement with Mobbin

- **A service of Parity's holds the key** and answers the app's searches, as the stock photo service will for Unsplash
  (PAR-131). The key never ships in the app.
- **Connect Mobbin goes away** and the tab just works, perhaps on Parity's paid plans only, since each search costs.
- **This needs Mobbin's written agreement first.** Mobbin's REST API is on Team and Enterprise plans, with a key scoped
  to one workspace and 60 requests a minute shared by everyone using it. Its published terms don't let a workspace serve
  people who aren't its members. What to ask for is in [Questions for Mobbin](#questions-for-mobbin).
- **The tab and the agent tool stay the same either way.** Only where main sends a search changes.

## What's kept

- **A reference on the canvas keeps its source, id, kind, app, platform, Mobbin link, size and place,** in the designs
  file with the canvas's other items. It isn't saved into `public/images/`.
- **Mobbin's image links expire after 30 days.** Main fetches a fresh link by the reference's id when one has expired,
  and a reference whose image can't load shows its app's name and Open in Mobbin.
- **The app keeps fetched images in its own cache,** in the app's data rather than the project, only if Mobbin's terms
  allow it. Until they say, every image loads from Mobbin.
- **Searches aren't kept,** apart from the last one per project, so the tab opens where it was.

## The spike

Before building it: a Mobbin Team plan with one seat, $72 for 3 months, the cheapest plan with both the REST API and
MCP.

- Connect with OAuth from a dev copy and search through MCP, as the first version will.
- Search through the REST API from a small service, as the later version would, to see its results and speed.
- Check whether the MCP search can fetch a screen by its id, which refreshing expired links needs.
- Check how long a deep search takes, and whether standard mode is good enough for the tab.

Only your team sees the results during the spike, which a Team plan covers.

## Questions for Mobbin

In this order, since the first decides whether the rest matter:

1. **Showing results to people who aren't Mobbin members,** through Parity's key, inside Parity.
2. **Keeping images:** caching them in the app, and keeping a reference's image past 30 days.
3. **How Mobbin wants to be credited** in the tab and on the canvas.
4. **A price per search** instead of per seat, and whether deep searches cost more.
5. **A higher limit** than 60 requests a minute for the workspace.

## Still to decide

- **Whether references belong to a project or to the person.** This proposal keeps them in the project's designs file,
  so everyone on the project sees them, which means they're in the repository. A person-only board would keep them out.
- **Refero as a second source,** in the same tab with a source picker, once there's a reason to have both.
- **A free fallback** for people without a Mobbin account. None of the libraries offers one that's worth showing.
