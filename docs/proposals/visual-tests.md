# Proposal: fast visual tests

Status: draft, 2026-10-29. Nothing is built. It builds on two decisions already made: visual tests draw each frame as a
page of its own (VAL-18), and the render sweep compares those pages with baselines (VAL-1). The items are the VIS stream
in the [backlog](../backlog.md), and two questions for you are in Waiting on you.

## In one line

Every design in every state and mode is already a test case. `parity test` draws each one as its own page on the
project's dev server, skips every case whose inputs haven't changed, captures the rest with Chromium and compares them
with baselines kept in the repo. The same runner works on your machine while you design, inside the app, and in CI.

## Why Parity can be faster than Chromatic

Chromatic and tools like it start from a Storybook build: build every story, upload the build, capture in cloud
browsers, then compare. Their fast path, [TurboSnap](https://www.chromatic.com/docs/turbosnap/), reads the git changes
since the last build and the bundler's module graph to find the story files a change can reach. That needs the git
history of the previous build. When a rebase, squash or force push removes that commit, it falls back to an older build.
Parity can skip most of that work, because it already has most of the parts:

| What Parity already has                                                                                                                      | What it buys visual tests                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The test matrix.** Designs, states and modes in the `.par`, each with an id.                                                               | No stories to write and no build to list them. The list of cases is a pure function of the document.                                                                  |
| **Each case as plain data.** [render.ts](../../packages/core/src/render.ts) resolves a design for a state and mode into a `RenderNode` tree. | A hash of that tree says whether the design itself changed. Editing one design changes only its own cases.                                                            |
| **The project's own dev server.** [builder-vite](../../packages/builder-vite/src/index.ts) runs the project's Vite.                          | No Storybook build and no upload. Modules compile on demand, and the server sees every file a case's page loads, which is what lets Parity skip cases (below).        |
| **The project's CSS and tokens.** Core reads both.                                                                                           | A case can be keyed on the CSS rules and tokens it actually uses, so changing a token re-tests only the cases that use it.                                            |
| **A measured box for every node.** `RenderedFrame.nodes` from the offscreen renderer.                                                        | A change reads "`header/avatar` grew from 32 to 40 px and everything below moved", not "38,000 pixels differ". A shift is reported once, not as every pixel under it. |
| **Offscreen checks.** Accessibility (axe) and the project's console, per frame.                                                              | The same pass checks accessibility and render errors, with no add-ons.                                                                                                |
| **The canvas.** A case is a frame you can already see.                                                                                       | Review happens on the frame itself, while you design and before you push, rather than in a separate web app after CI.                                                 |
| **An agent CLI and MCP tools.**                                                                                                              | Agents get results by node id, fix the design or the code, and re-run only the affected cases.                                                                        |

Where the time goes in a run, side by side:

| Step                      | Chromatic                                                             | Parity                                                                                          |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Before the first capture  | Build the whole Storybook and upload it                               | Start Vite (lazy) and hash inputs. A run where nothing changed ends here                        |
| Choosing what to capture  | Story files reachable from git changes since the last build           | Cases whose own inputs changed: tree, files loaded, packages, CSS used, mode, environment       |
| Where the browser runs    | A cloud fleet that fetches the uploaded build                         | On your machine or the CI runner, fetching over loopback                                        |
| Waiting for a stable page | The story's render, plus delays set per story where that isn't enough | Parity's own page reports when React committed, lazy parts arrived, and fonts and images loaded |
| Comparing                 | In the cloud, after upload                                            | A hash first; a pixel diff only when the hash differs                                           |
| Reviewing                 | Chromatic's web app                                                   | The canvas, the app's review panel, an HTML report in CI, and `--json` for agents               |
| Cost                      | Billed per snapshot                                                   | Your own machines                                                                               |

What Chromatic does better, for fairness:

- **A hosted review** that people without the app can open from a pull request, with history.
- **Several browsers at scale.** Parity starts with Chromium only.
- **Builds that touch no UI are now free**
  ([August 2026 changelog](https://www.chromatic.com/blog/chromatic-changelog-august-2026/)). Parity's keys give the
  same result per case rather than per build.
- **Nothing to run yourself.** Parity's model is local-first: your machine and your CI runners.

## What Refracto taught us

Refracto is the VRT CLI behind the vrt-dashboard in the SkillingUI repo (`D:\msft\SkillingUI\packages\vrt-cli`, with
`vrt-core` and the `vrt-storybook` addon). It does what Chromatic does for Storybook, self-hosted, with baselines in
git. It's been tuned for speed and flake, so its lessons are worth more than its code.

### What to take

- **The diff: `pixel-buffer-diff` in SSIM mode.** Refracto compares decoded RGBA buffers with
  `diffImageDatas(..., { mode: "ssim" })`, padding both images to a multiple of 64 pixels first, as the library needs.
  The windowed SSIM tolerates anti-aliasing noise, where pixelmatch-style diffs need a threshold. A per-pixel threshold
  of 0.01 matches jest-image-snapshot's default, and a design or state can override it. The compare runs on RGBA, so the
  same function runs in Node for the gate and in the browser for review, and both always agree.
- **Changed regions from the diff buffer.** Refracto flags each 16 px tile that has a changed pixel, joins neighbouring
  tiles into boxes, largest first, and caps the count. The diff already made the buffer, so this is close to free.
  Parity goes further, mapping each box to the layers under it.
- **A hash before any decoding.** A SHA-256 of the captured bytes is compared with the one stored for the baseline.
  Equal bytes pass with no decode and no diff. Refracto measured that decoding dominates comparison, so it dropped a
  perceptual-hash pre-filter, and found compare fast enough that a worker pool wasn't worth it.
- **`sharp` for images.** It decodes about 7× faster than pngjs in Refracto's measurement. It stores baselines as
  lossless WebP at effort 2, which was the smallest and fastest lossless option they tried. It round-trips bit for bit
  and takes less room in git than PNG.
- **Crop to the content.** Smaller images make every later step cheaper. A Parity frame already has an exact box, so a
  case captures exactly the frame.
- **Determinism, item by item:**
  - `Date` is frozen at one instant, while `Date.now` keeps a fixed offset so elapsed times stay true.
  - `Math.random` and `crypto.getRandomValues` are pinned.
  - The time given to `requestAnimationFrame` callbacks is pinned, so animation libraries that advance by it stand
    still, but `performance.now` isn't touched, since React's scheduler needs it.
  - CSS animation and transition durations are 0 before the render. Using 0 rather than `none` keeps `transitionend`
    events firing.
  - Web Animations are finished with `finish()`, and a few animation frames are run to let rAF-driven layouts settle.
  - Video and audio are blocked at the network and paused.
  - The page's scrollbar takes no space, so content right at the edge doesn't change the page's width from run to run.
  - Time zone UTC, a fixed pixel ratio and reduced motion are set, and requests to other origins are blocked.
- **Readiness pushed, not polled.** The page calls a function the runner exposed (`exposeBinding`) when it has settled,
  so the runner waits on an event rather than a loop.
- **Parallel work sized by measurement.** About four pages in flight per browser process was Refracto's sweet spot,
  since one event loop drives them. Beyond that it forks processes, each about 360 MB at peak. Shards are kept above
  about 30 cases, because each unit's setup (about 3.6 s) otherwise dominates, and the longest go first. Seven projects
  took 142 s instead of 551 s run one after another.
- **The CI contract:**
  - exit 0 when nothing changed, 1 when changes need review, 2 when something is broken, 3 for a usage error;
  - JUnit for test tabs and SARIF for accessibility findings;
  - `--json` on every command, and accept, deny and submit as commands, so an agent can drive the whole loop.
- **The environment is part of the key.** Refracto's distributed design keys every image on a fingerprint of the browser
  build, the OS image and the font package. A new fingerprint means a new baseline, not a failed comparison.
- **Keep the browser next to the files.** Cloud browsers loading a build through a tunnel were about 10× slower per
  snapshot (4 to 6 s against 0.4 s).
- **No retries to hide flakes.** Fix the nondeterminism instead.

### What to leave

- **Building and scraping Storybook.** Parity draws its own designs on the project's dev server.
- **A second screenshot on every capture.** Refracto takes screenshots 400 ms apart, up to ten, until two match. That
  cost is paid by every case. Parity checks again only when a capture differs from its baseline ("Verify on mismatch",
  below).
- **Detecting loading states by a library's class names** (`.fui-Skeleton`). A Parity state that shows loading is
  declared as one, so the runner never has to guess.
- **Forcing one font family on everything.** Fonts are part of a design. Parity pins the machine's fonts through the
  environment, and waits for the project's own web fonts.
- **Hiding every focus ring and tooltip.** Refracto needed this because play functions leave focus behind. A Parity case
  starts with nothing focused, and a state that shows focus or a tooltip asks for it.
- **Choosing what to capture from git diffs.** Keys from what each case loaded are more precise and need no history. The
  one place Refracto needed lockfile parsing, which packages changed, falls out of the keys as well.
- **A constant `Math.random`.** Code that draws until it gets a different value never finishes. A seeded generator, the
  same seed for every case, is as stable and safe.

## How a run works

### Cases

A case is one design in one state and one mode, named by ids: `design/state/mode`. By default a design is tested in the
modes it shows. A design or state can opt out, and VAL-1's "every component with its default props" is an extra source
of cases that's off by default. Component designs with states are the better source.

### The case page

This is VAL-18. Each case loads as its own page on the project's dev server:

- The page imports the guest, the decorators and only the components the case uses.
- It sets up the mode: viewport, pixel ratio, colour scheme, reduced motion and touch, as the decision lists.
- It mounts the case's `RenderNode` tree.
- A script that runs before any module applies the determinism list above.
- The page reports ready through the exposed binding once:
  - React has committed;
  - no module or dev-server request is pending, so lazy parts have arrived;
  - `document.fonts.ready` has resolved and every image has decoded;
  - two animation frames have passed.

One change to the decision is worth making for speed (Q2 in the backlog). Give each case a **fresh page** in a browser
context shared by one worker, and clear storage, cookies and service workers between cases, rather than a fresh context
per case. A page already gives a case its own window, document, modules, portals, focus and listeners, which is what the
decision asks for. The context would add only an empty HTTP cache, and with the dev server serving hundreds of modules,
an empty cache per case is the slowest part of a page load. Modes that need different touch or mobile emulation get a
context of their own per worker.

### Keys: skipping what can't have changed

Each case gets a key. A case whose key matches its baseline's passes without a browser.

| Part            | What it covers                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree            | A hash of the case's resolved `RenderNode` tree, with props and text                                                                                                                        |
| Mode            | Width, height, pixel ratio, colour scheme, globals                                                                                                                                          |
| Files loaded    | A hash of every project file the case's page asked the dev server for: source, CSS, images, fonts, JSON. Recorded the last time the case rendered                                           |
| Packages loaded | Name and version of every package whose files the page loaded. Bumping one package re-tests only the cases that loaded it                                                                   |
| CSS used        | Phase one: the compiled stylesheets. Phase two: only the rules that can match the case's classes, tags and attributes, and the custom properties they read, followed through `var()` chains |
| Toolchain       | Vite config, plugin versions, Parity's version                                                                                                                                              |
| Environment     | Browser build, OS image, font set, rendering settings                                                                                                                                       |

Why recording what the page loaded is safe: the set of files a case loads can change only if one of the files it loaded
changed, or its tree did, and both change the key. Dynamic imports, environment variables baked into modules and assets
are all covered, because they all go through the server. Nothing needs git history, so keys work on uncommitted changes,
rebases and squashes alike. Checking keys costs one transform of the stylesheets and a hash of each recorded file, and
needs no browser. A run where nothing changed should take seconds whatever the number of cases.

Keys are trusted, then checked. `--full` ignores them. A full run, nightly or on the main branch, reports any case whose
pixels changed while its key didn't as a key miss: a bug in Parity, not a review item.

The canvas's bitmap cache (CAN-28) needs the same key. Whichever comes first builds it, and the other reuses it.

### Capture

- **One engine everywhere:** Chromium's headless shell at a pinned build, driven through playwright-core, which the
  desktop app's scripts already use. The app runs the same runner as a child process rather than using its own Electron
  window, so your machine and CI use the same engine.
- **One screenshot per case:** CDP's `Page.captureScreenshot`, clipped to the frame's box, beyond the viewport, with
  `optimizeForSpeed`.
- **Workers:** one Vite server shared by every worker, warmed by transforming the union of the recorded files before any
  page opens. Each browser process has about four pages in flight, with more processes up to the cores and memory
  available. Hashing, decoding and diffing run off the main thread. Cases whose keys changed go first, and the longest
  go first after that, using the times stored with each baseline.

### Verify on mismatch

Comparing an image, in order:

1. **Hash the capture.** If it equals the baseline's hash, the case passes. This should be most cases.
2. **Decode both and diff with SSIM.** No change under the threshold also passes.
3. **On a change,** settle the page again and capture once more:
   - if the second capture matches the first, it's a real change;
   - if not, keep capturing a few times, and report the case as unstable, with the regions that moved, rather than as
     changed.
4. **A new case,** with no baseline, always gets the two-capture check, so a half-finished animation is never saved as a
   baseline.

Only cases that differ pay for a second capture, and flakes show up as flakes, with where they are.

### What changed, in Parity's words

Each baseline keeps the boxes of its nodes, rounded, beside the image. A changed case then reports:

- **The layers inside the changed regions,** by id and component.
- **A layout diff:** nodes that moved, resized, appeared or disappeared.
- **One cause for a shift:** when a node grows and everything after it moves by the same amount, the report names the
  node that grew and folds the moves under it. This is Refracto's "page shift detection", which it planned but didn't
  build, solved with data Parity already has.
- **Accessibility and console results from the same pass.** Only new axe violations need review, as Refracto and
  Chromatic do, and a render error makes the case broken.

## Your machine and CI

Baselines are only comparable on the same environment. Text antialiasing differs between Windows, macOS and Linux, and
decisions.md already notes that the canvas and Chrome antialias text differently. So there are two kinds of reference:

- **Committed baselines come from one environment:** a pinned Linux image with the Chromium build, the font set and
  software rendering. CI runs in it. On your machine, `parity test --docker` runs in it too, for an exact comparison
  with what's committed.
- **On your own machine, compare against twins.** When a case renders on your machine with the same key as its committed
  baseline, that render is its twin: same inputs, your environment. It goes in a cache outside the repo, under your
  environment's fingerprint. When an edit changes the case's key, the new render is compared with the twin, so the
  operating system never differs within a comparison. Watch mode keeps twins current as you work. A case you'd already
  changed before the cache was filled has no twin. For those, Parity says so and offers `--docker`, or renders the
  committed version from a temporary checkout.

## Baselines on disk

```
.parity/visual/
  config.json                           threshold, modes to include or skip, hosts allowed besides the dev server
  baselines/<design>/<state>__<mode>.webp   lossless WebP, committed
  baselines/<design>/<state>__<mode>.json   key parts, recorded inputs, capture hash, node boxes, time taken
  out/                                  not committed: captures, diffs, report.html, junit.xml, results.json
```

- **One small JSON per case,** rather than one manifest, so two pull requests conflict only when they change the same
  case. Recorded input lists repeat a lot, so they're stored once per distinct list and referred to by hash.
- **Ids, not names, in paths,** since names change and ids don't.
- **Git LFS is optional.** Lossless WebP keeps plain git workable for a long time.

## Commands

```
parity test                         key, capture, compare and report; exit 0, 1, 2 or 3
parity test --watch                 re-run the cases a save affects
parity test --only <design>[/<state>[/<mode>]]
parity test --full                  ignore keys and render everything
parity test --update                accept every change, for trusted branches
parity test --docker                run inside the pinned image
parity test --shard 2/4             a deterministic share of the cases, weighted by recorded time
parity test --reporter junit,sarif,json,html
parity test accept|deny <case…> [--from <report folder>]
parity test review                  open the results in the app
```

`parity test` runs without the app, unlike most of the CLI's commands, which call the running app. In CI it's one step:

```
parity test --ci --reporter junit,sarif,html
```

Caching `node_modules/.vite-parity` between CI runs saves Vite's dependency step. Changes that need review leave a
report folder as the job's artifact, with the captures, diffs and an HTML page. `parity test accept --from <folder>`, or
opening the folder in the app, writes the accepted baselines into your working tree to commit with the change, so
baselines land in the pull request that caused them.

## In the app

- **Frames carry their result.** Changed, new, unstable or broken shows as a badge on the frame. A toggle overlays the
  baseline on the frame itself, with the changed regions outlined, and lists the layers that changed.
- **A Visual tests panel** lists the cases that need review, grouped by design. It shows the baseline, the capture and
  the diff side by side or overlaid, with accept and deny for a case, a design or everything, from the keyboard.
  Accepting writes baselines through changesets (PKG-2), so it can be undone.
- **Watch mode by default while a project is open,** as a low-priority background job. Saving a file re-runs only the
  cases that loaded it. Changing a design re-runs only its cases. Results arrive as each case finishes.
- **Agents** get a `visual_test` MCP tool and `parity test --json`. Results name nodes, so an agent can fix a design and
  re-run just those cases. The skill tells agents to ask you before accepting changes.

## Targets

These are targets to measure, not claims. A benchmark like `pnpm perf` records them on the example project (VIS-12), so
"faster than Chromatic" stays something we've checked:

- A run where nothing changed: under 5 s end to end, Vite start included, whatever the number of cases.
- A warm capture: under 100 ms per case per page in flight. Refracto measured about 0.4 s per snapshot on a local
  machine, from a Storybook build.
- From save to result in watch mode, for an edit that touches up to ten cases: under 1 s.

## Later

- **Hover, focus and active states,** forced on a node through CDP's `CSS.forcePseudoState`. The pointer never moves, so
  these states are deterministic. Storybook users get this from the pseudo-states addon.
- **Steps before the capture:** clicks and typing from AGT-10, for open menus and filled forms.
- **Stories as cases.** Through Storybook's portable stories, under the StoryAdapter (SB-1). A project's existing
  stories would get the same keys, and need no Storybook build.
- **Firefox and WebKit** through the same Playwright driver, as Refracto does.
- **A prebuilt bundle for CI.** One `vite build` of the case page, so pages load a few chunks instead of hundreds of
  modules. Keys map chunks back to their source files through the build's module list. This is worth doing only if the
  benchmark shows module loading dominates in CI.
- **pixel-buffer-diff against BlazeDiff.** [BlazeDiff](https://jsr.io/@blazediff/core-native) has a Rust version and
  SSIM modes. Benchmark the two on Parity's frames before settling. Frames are whole screens, bigger than Storybook's
  component crops, so the diff's speed matters more here. Check both packages' licences and upkeep first.

## Order

Each step is a backlog item in the VIS stream:

1. **The pure parts first:** cases, keys and per-case records in `@parity/visual` (VIS-1), and the SSIM compare with
   regions (VIS-2). These are data in and data out, tested without Electron or a browser.
2. **The page and the runner:** VAL-18, then `parity test` with capture, the hash gate, verify on mismatch, baselines,
   reports and exit codes (VIS-3), and the benchmark (VIS-12).
3. **Skipping:** recorded inputs and packages (VIS-4), then the CSS each case uses (VIS-5).
4. **Environments:** the pinned image and `--docker` (VIS-6), then twins (VIS-7).
5. **The loop you'll feel:**
   - watch mode (VIS-8);
   - changed layers and the layout diff (VIS-9);
   - review on the canvas and in the panel (VIS-10).
6. **Around it:**
   - accessibility and the console per case (VIS-11);
   - CI templates, reporters and shards (VIS-13);
   - agent tools (VIS-14).

VAL-1, the render sweep over the validation projects, then becomes `parity test` on each validation project plus its
canvas-against-page layout check.

## Calls made here

These are my calls, open to change. They go into decisions.md once you agree with this proposal.

- One capture engine everywhere: a pinned Chromium headless shell. The app runs the runner rather than using its own
  window.
- Committed baselines come only from the pinned Linux image. Other machines compare against twins.
- Cases are skipped by keys built from what each case loaded, not from git diffs, and a full run checks the keys.
- `pixel-buffer-diff` in SSIM mode, with a per-pixel threshold of 0.01 by default, until the benchmark against BlazeDiff
  says otherwise.
- Baselines are lossless WebP with one JSON per case in `.parity/visual/`, committed, with LFS optional.
- A second capture only on a mismatch, and unstable cases are reported as unstable, never retried until they pass.
- Random values come from a seeded generator, not a constant.

## Decisions needed from you

1. **When to build it (Q1).** VAL-18 is marked Later, after the core. Everything here waits on it, except VIS-1 and
   VIS-2, which could start at any time.
2. **A fresh page per case in a shared context (Q2),** rather than a context per case, to keep the HTTP cache warm. This
   changes the wording of the VAL-18 decision. Each case still gets its own window, document, modules and storage.
