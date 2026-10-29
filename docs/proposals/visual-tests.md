# Proposal: fast visual tests

Status: draft, revised 2026-10-29 after your review. Three things changed: CI is the priority, nobody runs Docker on
their own machine, and a code change under an unchanged design must be caught, including one a sync will bring into the
design. Nothing is built. It builds on two decisions already made: visual tests draw each frame as a page of its own
(VAL-18), and the render sweep compares those pages with baselines (VAL-1). The items are the VIS stream in the
[backlog](../backlog.md), and two questions for you are in Waiting on you. You've settled a third: `@parity/cli` will be
public on npm, so CI runs it with `npx`.

## In one line

In CI, Parity works out which cases a pull request can change before installing anything, renders only those on any
Linux runner without a container, and puts the changes on the pull request for review. On a developer's machine the same
runner answers in seconds while they design, with nothing to set up.

## What it has to do

1. **CI first.** Pull requests are where visual tests pay off. One that touches no UI should pass in seconds, and one
   that does should render only what it can change.
2. **Nothing to install on a developer's machine.** No Docker, no images, nothing beyond Parity. Committed baselines
   come from CI, so a developer's machine never has to match CI's pixels.
3. **Test what the app will show.** A design that hasn't changed still changes when the code under it does: a component
   it uses, or the file of a linked component that a sync will bring into the design.

A case is one design in one state and one mode, named by ids: `design/state/mode`. By default a design is tested in the
modes it shows.

## In CI

### The pipeline

| Step    | What happens                                                                                                                                     | What it needs                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Plan    | Checks each case's trace against git, the lockfile and the `.par` files, and lists the cases that need rendering. With none, the job passes here | Node and Parity's CLI. The project isn't installed            |
| Render  | Starts the project's Vite and captures the planned cases                                                                                         | The project's packages, and Parity's pinned browser and fonts |
| Compare | A hash first, then an SSIM diff; the layers that changed; accessibility and the console                                                          |                                                               |
| Report  | A check, a summary on the pull request, and an artifact with the captures and an HTML report                                                     |                                                               |
| Accept  | From the app, or with a comment on the pull request. CI's own captures become the baselines                                                      |                                                               |

### Plan: what can have changed, before installing anything

Each case remembers what its last render read: its trace. A trace lists:

- the case's resolved tree, after the sync described below, and its mode;
- every project file the page loaded, by its git blob hash, including decorators such as `.parity/preview.tsx`;
- every package the page loaded, by name and version from the lockfile;
- the Tailwind classes it used, with the stylesheet sources, plugins and Tailwind version behind them (VIS-5 narrows
  this to the tokens it read);
- the toolchain: the Vite config, the `.env` files Vite reads and Parity's version;
- the environment's fingerprint.

If everything a trace lists is unchanged, the render would read the same things and draw the same picture, so the case
passes without a browser. That holds for imports that only happen at run time too: a new import can only come from a
file the trace already lists, and that file would have changed. Build systems such as Shake call these verifying traces.

Checking traces needs nothing installed:

- **Files:** `git ls-files -s` gives every tracked file's blob hash at once, on a shallow clone too. Untracked files a
  page read, such as `.env.local`, are hashed from disk.
- **Packages:** versions come from the lockfile. A lockfile Parity can't read precisely is hashed whole instead, which
  is slower but never wrong. A workspace package used through a built `dist` folder counts as all of that package's
  tracked files.
- **Designs:** come from the `.par` files, through core.
- **Tailwind:** its rules for a set of classes depend only on those classes, the stylesheet sources, its plugins and its
  version, so a class added in some other file doesn't touch this case.

A full run, nightly or on demand, renders everything. Any case whose picture changed while its trace still verified is
reported as a miss, which is a bug in Parity, not a review item.

Where traces live:

- **In each case's committed record:** the trace of the render that made its baseline. It changes only when the baseline
  does, so a pull request that changes code without changing pixels rewrites no records and causes no merge conflicts.
- **In CI's cache:** the traces and results of every run, on any branch. They're facts about content, true whichever
  branch made them, so a pull request can restore main's cache as well as its own.

A case passes the plan when a trace from either place still verifies and its result matches the baseline. A missing
cache costs renders, never a wrong answer.

### What a pull request costs

Parity's column is targets, which VIS-12 measures. Chromatic's comes from its docs.

| Pull request                        | Chromatic                                                                                                                           | Parity                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Touches no UI: backend, docs, tests | Since [August 2026](https://www.chromatic.com/blog/chromatic-changelog-august-2026/), nothing is captured or charged                | The plan step only: seconds, with nothing installed and no browser                          |
| Changes one component               | Builds and uploads Storybook, then captures the stories [TurboSnap](https://www.chromatic.com/docs/turbosnap/) traces to the change | Installs (cached), starts Vite, and renders only the cases whose traces read that component |
| Changes a token                     | Every story the changed stylesheet reaches in the module graph, which for a global stylesheet is all of them                        | Every case that read the stylesheet, and with VIS-5 only the cases that read the token      |
| Pushes again with an unrelated fix  | Builds and uploads again                                                                                                            | Cases already rendered with the same inputs come from the cache                             |
| Merges to main                      | Builds again                                                                                                                        | Accepted cases' traces verify, so nothing renders                                           |
| Rebased or squashed                 | When the last build's commit is gone, TurboSnap looks for an older build                                                            | Traces don't depend on git history                                                          |

### Render: the same pixels on any Linux runner, without a container

- **Parity's own browser.** Parity downloads the Chromium headless shell build its version names on first use, and
  caches it as Playwright does.
- **Parity's own fonts.** A pinned font pack supplies the system and fallback fonts, with its own fontconfig file, so
  neither the runner's installed fonts nor its fontconfig defaults (hinting, antialiasing) count. The project's web
  fonts load from its dev server as usual.
- **Fixed settings:** software rendering, no GPU, the sRGB colour profile and font hinting off.
- **Fingerprinted.** The browser build, font pack, settings and OS family make a fingerprint that's part of every trace.
  On a runner with a fingerprint Parity doesn't know, it says so before comparing, rather than reporting every case as
  changed.
- **Linux only, for baselines.** Each OS draws text with a different library, so baselines come from Linux, on GitHub's
  and Azure DevOps' hosted Ubuntu runners as they come. A container image is there for CI systems that prefer one, but
  nothing needs it.

VIS-6 holds this to account: two different Ubuntu runner images must give byte-identical captures.

### Report on the pull request

- **A check** that fails when changes need review (exit 1) or something broke (exit 2), and passes otherwise.
- **A summary on the pull request:** the counts, then each changed case and its changed layers, in Parity's words. For
  example: "`settings/default/mobile`: `header/avatar` grew from 32 to 40 px, and 6 layers below it moved". Each one
  links into the report.
- **An artifact:** captures, baselines, diffs, `results.json`, and an HTML report that works offline.
- **JUnit** for the test tab, and **SARIF** for accessibility findings.
- **Drift is listed apart:** designs that a sync will change ("When code changes under a design", below).

### Accepting changes

Baselines are always CI's own captures, so the next run matches them byte for byte.

- **From the app, the main way.** Parity shows the latest run's results for the branch the person has open. It fetches
  the run's artifact from GitHub or Azure DevOps with the sign-in the person already has, through `gh` or `az`. The
  changes show on the frames themselves. Accepting writes CI's captures and traces into the working tree, together with
  any sync the change needs, ready to commit and push. The next run's plan then verifies every accepted case without
  rendering it.
- **From the pull request, if the project turns it on.** A comment such as `/parity accept` or
  `/parity accept settings/*` runs a small job that commits the run's captures to the branch. It needs a token that can
  push, which pull requests from forks don't get, so it's off by default.
- **The first run** makes a project's baselines the same way: everything is new, and accepting it all commits them.

### Main and releases

- **After a merge,** main's run verifies the accepted records, so nothing accepted renders again. Main's traces fill the
  cache that pull requests restore.
- **Two pull requests that both accepted changes to one case** conflict in git on its record, so the second rebases and
  runs again.
- **A case changed only by two pull requests together** renders on main's run. With a merge queue, that happens on the
  combined commit, before the merge.
- **A visual changelog.** Records are in git, so `parity test changes --since v1.4` lists the cases whose baselines
  changed between two commits, with before and after, for release notes or a deploy's sign-off.

### Shards

The plan knows the cases and their recorded times before any runner starts, so it can output a matrix: as many render
jobs as the work needs, and none when nothing needs rendering. GitHub Actions takes it as a dynamic matrix, and Azure
DevOps as a job parameter. The longest cases go first.

### An example workflow

On GitHub Actions, in one job, with the install skipped when nothing needs rendering:

```yaml
name: Visual tests
on: pull_request
jobs:
  visual:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 24 }
      - uses: actions/cache@v4
        with:
          path: .parity/visual/cache
          key: parity-visual-${{ github.sha }}
          restore-keys: parity-visual-
      - id: plan
        run: npx @parity/cli test plan --github-output
      - if: steps.plan.outputs.render == 'true'
        run: corepack enable && pnpm install --frozen-lockfile
      - if: steps.plan.outputs.render == 'true'
        run: npx @parity/cli test render
      - run: npx @parity/cli test report --ci
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: parity-visual, path: .parity/visual/out }
```

A sharded version adds a plan job whose output is the render jobs' matrix. VIS-13 writes both, and the Azure DevOps
equivalents.

## When code changes under a design

There are two ways code reaches a design, and each is caught.

### Components a design uses

A design that places the project's `Button` has a page that imports `components/ui/button.tsx` and everything that
imports, so all of it is in the case's trace. Change `button.tsx`, and every case that loaded it renders again, while
cases that never loaded it don't. A library upgrade works the same way, since the package's version is in the trace.

### Linked component designs

A linked component design is the source, linked to a file Parity wrote ("Option C" in decisions.md). The canvas draws
the design from the `.par`. A hand edit to `member-row.tsx` therefore changes the app, but not the canvas, until someone
opens the design's drift review and approves the edit into the design. In CI nobody does that, so the run does the
sync's reading itself:

- **Read back what can be read.** For each linked file whose hash differs from the one Parity last wrote, Parity reads
  back what it can: text, token classes, props and known components, through CMP-22's read-back in `@parity/code`, which
  is pure. The result goes into the design in memory, not into the `.par`. The run then renders the design, and every
  instance of it, as it will be once synced.
- **Render the file for what can't.** An edit Parity can't read back gets frozen or overwritten when someone syncs.
  Until they choose, CI renders the file itself for that design, which is what the app will show.
- **Report it as drift,** apart from ordinary changes. For example: "`member-row.tsx` was edited by hand, and once
  synced, 14 cases change like this." Accepting in the app approves the sync into the `.par` and takes the baselines, in
  one commit.
- **The other direction:** a design changed in the `.par` whose file hasn't been written yet. CI renders the design,
  since the design is the source, and reports "code not written yet", so a reviewer sees that the app lags the design.
  It doesn't fail the check.
- **Traces list linked files too,** so the plan catches a hand edit without rendering anything.
- **Until CMP-22 lands,** a linked file changed by hand is rendered from the file and listed as drift.

## On a developer's machine

Nothing to set up: Parity's pinned browser downloads itself the first time, as in CI.

- **Local results compare with local renders,** never with committed baselines, since Windows and macOS draw text
  differently from CI's Linux. Parity works out each case's state at HEAD from git, and keeps a cache of this machine's
  renders. A changed case is compared with this machine's render of the same case at HEAD. That render comes from the
  cache, or is rendered once from a temporary copy of HEAD's files that links the installed packages.
- **Watch mode in the app** keeps that cache warm. Saving a file re-renders only the cases whose traces read it, and
  changing a design re-renders only its cases.
- **CI's verdict shows in the app too,** for the open branch, so the person reviews and accepts CI's captures without
  leaving Parity.
- **On Linux with CI's fingerprint,** local results compare with the committed baselines directly.

## Why Parity can be faster than Chromatic

Chromatic and tools like it start from a Storybook build. Parity has most of the parts already:

| What Parity already has                                                                                                                      | What it buys visual tests                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **The test matrix.** Designs, states and modes in the `.par`, each with an id.                                                               | No stories to write and no build to list them. CI can plan from the `.par` before installing anything.                                                                   |
| **Each case as plain data.** [render.ts](../../packages/core/src/render.ts) resolves a design for a state and mode into a `RenderNode` tree. | A hash of that tree says whether the design itself changed.                                                                                                              |
| **The project's own dev server.** [builder-vite](../../packages/builder-vite/src/index.ts) runs the project's Vite.                          | No Storybook build and no upload. The server sees every file a case's page loads, which is what makes traces.                                                            |
| **The project's CSS and tokens.** Core reads both from the stylesheets' sources.                                                             | Traces can name the tokens a case reads, so changing a token re-tests only the cases that use it.                                                                        |
| **Design and code, linked both ways.** `@parity/code` (CMP-22, CMP-25).                                                                      | CI can show what a hand edit will do to the design once synced, which no Storybook tool can know.                                                                        |
| **A measured box for every node.** `RenderedFrame.nodes` from the offscreen renderer.                                                        | A change reads "`header/avatar` grew from 32 to 40 px and everything below it moved", not "38,000 pixels differ". A shift is reported once, not as every pixel under it. |
| **Offscreen checks.** Accessibility (axe) and the project's console, per frame.                                                              | The same pass checks accessibility and render errors, with no add-ons.                                                                                                   |
| **The canvas.** A case is a frame the person can already see.                                                                                | Review happens on the frame itself, rather than in a separate web app.                                                                                                   |
| **An agent CLI and MCP tools.**                                                                                                              | Agents get results by node id, fix the design or the code, and re-run only the affected cases.                                                                           |

What Chromatic does better, for fairness:

- **A hosted review** that people without the app can open from a pull request, with history.
- **Several browsers at scale.** Parity starts with Chromium only.
- **Nothing to run yourself.** Parity runs on the project's own CI runners.

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
  - `--json` on every command, and accept and deny as commands, so an agent can drive the whole loop.
- **The environment is part of the key.** Refracto's distributed design keys every image on a fingerprint of the browser
  build, the OS image and the font package. A new fingerprint means a new baseline, not a failed comparison.
- **Keep the browser next to the files.** Cloud browsers loading a build through a tunnel were about 10× slower per
  snapshot (4 to 6 s against 0.4 s).
- **No retries to hide flakes.** Fix the nondeterminism instead.

### What to leave

- **Building and scraping Storybook.** Parity draws its own designs on the project's dev server.
- **Choosing what to capture from git diffs and a saved module graph.** Refracto's affected-story detection needs the
  baseline commit's graph and falls back to capturing everything for lockfiles it can't parse. Traces need no history,
  and an unreadable lockfile costs only the cases that loaded packages.
- **Committing candidates to the pull request for review.** Refracto's CI pushes a review archive onto the branch.
  Parity reads CI's artifact instead, and commits only what someone accepts.
- **A second screenshot on every capture.** Refracto takes screenshots 400 ms apart, up to ten, until two match. That
  cost is paid by every case. Parity checks again only when a capture differs from its baseline ("Verify on mismatch",
  below).
- **Detecting loading states by a library's class names** (`.fui-Skeleton`). A Parity state that shows loading is
  declared as one, so the runner never has to guess.
- **Forcing one font family on everything.** Fonts are part of a design. Parity pins the fallback fonts with its font
  pack, and waits for the project's own web fonts.
- **Hiding every focus ring and tooltip.** Refracto needed this because play functions leave focus behind. A Parity case
  starts with nothing focused, and a state that shows focus or a tooltip asks for it.
- **A constant `Math.random`.** Code that draws until it gets a different value never finishes. A seeded generator, the
  same seed for every case, is as stable and safe.

## How a case renders

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

### Capture

- **One engine everywhere:** the pinned Chromium headless shell, driven through playwright-core, which the desktop app's
  scripts already use. The app runs the same runner as a child process rather than using its own Electron window.
- **One screenshot per case:** CDP's `Page.captureScreenshot`, clipped to the frame's box, beyond the viewport, with
  `optimizeForSpeed`.
- **Workers:** one Vite server shared by every worker, warmed by transforming the files the planned cases' traces list
  before any page opens. Each browser process has about four pages in flight, with more processes up to the cores and
  memory available. Hashing, decoding and diffing run off the main thread.

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

## Baselines on disk

```
.parity/visual/
  config.json                                threshold, modes to include or skip, hosts allowed besides the dev server
  baselines/<design>/<state>__<mode>.webp    lossless WebP, committed
  baselines/<design>/<state>__<mode>.json    committed: the trace of the render that made the baseline, the capture's
                                             hash, node boxes and the time it took
  cache/                                     not committed: traces and results of earlier runs, restored in CI
  out/                                       not committed: this run's captures, diffs, report, junit.xml, results.json
```

- **One small JSON per case,** rather than one manifest, so two pull requests conflict only when they change the same
  case. Recorded file lists repeat a lot, so the cache stores each list once and refers to it by hash.
- **Ids, not names, in paths,** since names change and ids don't.
- **Git LFS is optional.** Lossless WebP keeps plain git workable for a long time.

## Commands

```
parity test                        plan, render and report in one step
parity test plan                   what needs rendering, without installing or rendering (--github-output, --shards n)
parity test render [--shard i/n]   render the planned cases
parity test report --ci            merge shards, write the summary and reports, exit 0, 1, 2 or 3
parity test --watch                re-run the cases a save affects
parity test --only <design>[/<state>[/<mode>]]
parity test --full                 ignore traces and render everything
parity test accept|deny <case…> [--from <run or folder>]
parity test changes --since <ref>  cases whose baselines changed, with before and after
```

`parity test` runs without the app, unlike most of the CLI's commands, which call the running app. CI gets it with
`npx @parity/cli`, since the CLI will be public on npm (your call, 2026-10-29).

## Targets

These are targets to measure, not claims. A benchmark like `pnpm perf` records them on the example project (VIS-12), so
"faster than Chromatic" stays something we've checked:

- **Plan, with nothing installed:** under 2 s for 1,000 cases, after checkout.
- **A pull request that touches no UI:** done within 15 s of checkout, fetching the CLI included.
- **A warm capture:** under 100 ms per case per page in flight. Refracto measured about 0.4 s per snapshot on a local
  machine, from a Storybook build.
- **Byte-identical captures** on two different Ubuntu runner images.
- **Watch mode on a developer's machine:** under 1 s from save to result, for an edit that touches up to ten cases.

## Later

- **Hover, focus and active states,** forced on a node through CDP's `CSS.forcePseudoState`. The pointer never moves, so
  these states are deterministic. Storybook users get this from the pseudo-states addon.
- **Steps before the capture:** clicks and typing from AGT-10, for open menus and filled forms.
- **Stories as cases.** Through Storybook's portable stories, under the StoryAdapter (SB-1). A project's existing
  stories would get the same traces, and need no Storybook build.
- **Firefox and WebKit** through the same Playwright driver, as Refracto does.
- **A prebuilt bundle for CI.** One `vite build` of the case page, so pages load a few chunks instead of hundreds of
  modules. Traces map chunks back to their source files through the build's module list. This is worth doing only if the
  benchmark shows module loading dominates in CI.
- **pixel-buffer-diff against BlazeDiff.** [BlazeDiff](https://jsr.io/@blazediff/core-native) has a Rust version and
  SSIM modes. Benchmark the two on Parity's frames before settling. Frames are whole screens, bigger than Storybook's
  component crops, so the diff's speed matters more here. Check both packages' licences and upkeep first.
- **A shared cache across machines,** as Turborepo's remote cache does for builds, if CI caches prove too short-lived.

## Order

CI comes first, as you asked. Each step is a backlog item in the VIS stream:

1. **The pure parts:** cases, traces and the plan in `@parity/visual` (VIS-1), and the SSIM compare with regions
   (VIS-2). These are data in and data out, tested without Electron or a browser.
2. **The page and the runner:** VAL-18, then `parity test` with capture, the hash gate, verify on mismatch, baselines,
   reports and exit codes (VIS-3). Then the pinned browser and fonts on any Linux runner (VIS-6), and the benchmark
   (VIS-12).
3. **CI:**
   - the plan before installing (VIS-4);
   - the cache between runs (VIS-24);
   - CI templates, the pull request summary and shards (VIS-13);
   - changed layers and the layout diff for the summary (VIS-9);
   - accepting from the app (VIS-21) and from the pull request (VIS-22);
   - the visual changelog (VIS-25).
4. **Code under designs:** linked designs rendered as they'll be once synced (VIS-23), after CMP-22.
5. **Precision:** traces that name tokens (VIS-5).
6. **A developer's machine:**
   - comparison with HEAD's renders (VIS-7);
   - watch mode (VIS-8);
   - review on the canvas (VIS-10).
7. **Around it:**
   - accessibility and the console per case (VIS-11);
   - agent tools (VIS-14).

VAL-1, the render sweep over the validation projects, then becomes `parity test` on each validation project plus its
canvas-against-page layout check.

## Calls made here

These are my calls, open to change. They go into decisions.md once you agree with this proposal.

- **Where baselines come from:** CI makes every committed baseline. Developers' machines compare with their own renders
  of HEAD, and nobody needs Docker.
- **Where CI runs:** any Linux runner, with Parity's pinned browser, fonts and settings. A container is optional, for CI
  only.
- **How cases are skipped:** CI plans from traces before installing. A case's committed record keeps only the trace of
  its accepted render, and CI's cache keeps the rest.
- **Linked designs:** CI renders them as they'll be once synced, and reports drift apart from other changes. Code that
  lags its design is reported, not failed.
- **Accepting:** it takes CI's captures, from the app first. Accepting from the pull request is opt-in per project.
- **Comparing:** `pixel-buffer-diff` in SSIM mode, with a per-pixel threshold of 0.01 by default, until the benchmark
  against BlazeDiff says otherwise.
- **Storing:** baselines are lossless WebP with one JSON per case in `.parity/visual/`, committed, with LFS optional.
- **Flakes:** a second capture happens only on a mismatch, and unstable cases are reported as unstable, never retried
  until they pass.
- **Random values** come from a seeded generator, not a constant.

## Decisions needed from you

1. **When to build it (Q1).** VAL-18 is marked Later, after the core. Everything here waits on it, except VIS-1 and
   VIS-2, which could start at any time.
2. **A fresh page per case in a shared context (Q2),** rather than a context per case, to keep the HTTP cache warm. This
   changes the wording of the VAL-18 decision. Each case still gets its own window, document, modules and storage.

How CI gets Parity's CLI (Q3) is settled: `@parity/cli` will be public on npm (your call, 2026-10-29).
