import { type ModeSettings } from "@parity-app/core"
import { defaultValues, type PreviewKind, previewKind, type Token, tokenReferences } from "@parity-app/tokens"
import { type LibraryToken, matchDescribed, type TokenChange } from "@parity-app/tokens"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Check, LayoutGrid, List, Search, X } from "lucide-react"
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useProject } from "../canvas/context.ts"
import { useHistory, useModeSettings } from "../design-store.ts"
import { comesTo, type TokenMap } from "../token-values.ts"
import { useTokenFailure, useTokenList } from "../tokens-store.ts"
import { save } from "./commands.ts"
import { Announce, CopyOnClick, useCopy } from "./Copy.tsx"
import { Hint } from "./Hint.tsx"
import { useHoverCard } from "./hover-card.ts"
import { PanelError } from "./PanelError.tsx"
import { PanelSectionTitle } from "./PanelSection.tsx"
import {
  Keyframes,
  type PreviewToken,
  swatch,
  TokenGlyph,
  tokenSections,
  TokenTile,
  useHoverPlay,
  valueLabel
} from "./token-previews.tsx"
import { keepEditing, TokenDetail } from "./TokenDetail.tsx"

type Source = "all" | "semantic" | "theme"
type View = "list" | "tiles"

/** A token with what its preview draws. */
interface Kinded {
  token: Token
  kind: PreviewKind
}

/** The themes a token has a value in: every theme for the project's own tokens, the root for the theme's scale. */
function themesOf(token: Token, themes: string[]): string[] {
  return token.source === "semantic" ? themes : ["default"]
}

/**
 * Each theme's name as the Modes panel gives it, by the class its option puts on a frame, which is how a token's values
 * are keyed: `dark` is Dark, and the option that adds no class names the root's values (Light). A library's themes
 * (Fluent's `teams-high-contrast`) are named however their options are.
 */
function themeNamesOf(settings: ModeSettings): Map<string, string> {
  const names = new Map<string, string>()
  for (const variable of settings.variables) {
    if (variable.kind !== "theme") continue
    for (const option of variable.options) {
      const key = option.className?.trim() || "default"
      if (!names.has(key)) names.set(key, option.name)
    }
  }
  return names
}

/** What a token's detail needs from the panel: the tokens it reads, each theme's name, and what the last save left. */
interface PanelData {
  kinded: readonly Kinded[]
  tokens: TokenMap
  themes: string[]
  themeNames: ReadonlyMap<string, string>
  described: ReadonlyMap<string, LibraryToken>
  unwritten: ReadonlySet<string>
}

const Panel = createContext<PanelData | undefined>(undefined)

/** A token as its preview draws it: what it comes to in each of its themes. */
function previewOf({ token, kind }: Kinded, tokens: TokenMap, themes: string[]): PreviewToken {
  const values = Object.fromEntries(
    themesOf(token, themes).map((theme) => [theme, comesTo(tokens, token.name, theme) ?? ""])
  )
  return { name: token.name, kind, values }
}

/** One line of the virtualized list: a section's title, a kind's heading under it, a row, tiles or a palette hue. */
type Item =
  | { type: "section"; key: string; title: string; count: number; first: boolean; open: boolean }
  | { type: "heading"; key: string; text: string; first: boolean }
  | { type: "row"; key: string; entry: Kinded; gap?: boolean }
  | { type: "tiles"; key: string; entries: Kinded[] }
  | { type: "hue"; key: string; hue: string; shades: Token[] }
  | { type: "note"; key: string; text: string }
  | { type: "described"; key: string; token: LibraryToken }
  | { type: "end"; key: string }
  | { type: "empty"; key: string }

/** How tall each line is before it's measured, close enough that the scrollbar doesn't jump. */
const estimates: Record<Item["type"], number> = {
  section: 44,
  heading: 22,
  row: 32,
  tiles: 84,
  hue: 24,
  note: 40,
  described: 28,
  end: 16,
  empty: 72
}

/**
 * Every token a design may use: the project's own (semantic) variables and its styling framework's full theme, in
 * sections by what they're for, each drawn as it looks. Any value can be edited; the change shows in every frame at
 * once, Undo takes it back, and saving the project writes it to the project's stylesheet. A token's name copies from
 * its row.
 */
export function TokensPanel() {
  const session = useProject()
  const { tokens: store, info } = session
  const tokens = useTokenList(store)
  const failure = useTokenFailure(store)
  const unwritten = new Set(failure?.tokens.map((change) => change.name))
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<Source>("all")
  const [view, setView] = useState<View>("list")
  // The sections folded closed, by title. Starting or clearing a search unfolds them, so matches always show.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const needle = query.trim().toLowerCase()
  const toggle = (title: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(title)) next.add(title)
      return next
    })
  const byName = useMemo(() => new Map(tokens.map((token) => [token.name, token])), [tokens])
  const themes = useMemo(() => [...new Set(tokens.flatMap((token) => Object.keys(token.values)))], [tokens])
  const described = useMemo(() => matchDescribed(info.describedTokens, tokens), [info.describedTokens, tokens])
  const kinded = useMemo(() => {
    const lookup = defaultValues(tokens)
    return tokens.map((token) => ({ token, kind: previewKind(token, described.byName.get(token.name)?.type, lookup) }))
  }, [tokens, described])
  const matches = kinded.filter(
    ({ token }) =>
      (source === "all" || token.source === source) && (!needle || token.name.toLowerCase().includes(needle))
  )
  const counts = { semantic: tokens.filter((t) => t.source === "semantic").length, theme: 0 }
  counts.theme = tokens.length - counts.semantic
  const unmatched = described.unmatched.filter((token) => !needle || token.path.toLowerCase().includes(needle))
  const modes = useModeSettings(session.store)
  const themeNames = useMemo(() => themeNamesOf(modes), [modes])
  const items = panelItems({
    matches,
    view,
    searching: Boolean(needle),
    unmatched: source === "all" ? unmatched : [],
    collapsed
  })

  const scroller = useRef<HTMLDivElement>(null)
  // The app doesn't use the React Compiler, whose memoizing this rule guards against.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => estimates[items[index]!.type],
    getItemKey: (index) => items[index]!.key,
    overscan: 8
  })
  // Tiles are two to a row, each as wide as its column: the list's width less its padding and the gap, halved, less the
  // tile button's own padding. A fixed width ran each tile into the next in a narrow panel.
  const [tileWidth, setTileWidth] = useState(104)
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const column = (entry!.contentRect.width - 24 - 4) / 2
      setTileWidth(Math.max(48, Math.floor(column - 8)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const draw = (item: Item): ReactNode => {
    switch (item.type) {
      case "section":
        return (
          <div className={`px-3 ${item.open ? "pt-3 pb-2" : "py-2"} ${item.first ? "" : "border-t"}`}>
            <PanelSectionTitle
              title={item.title}
              count={item.count}
              open={item.open}
              onToggle={() => toggle(item.title)}
            />
          </div>
        )
      case "heading":
        return (
          <div className={`px-4.5 pb-0.5 text-[11px] text-muted-foreground ${item.first ? "" : "pt-2"}`}>
            {item.text}
          </div>
        )
      case "row":
        return (
          <div className={`px-3 ${item.gap ? "pt-2" : ""}`}>
            <TokenRow
              entry={item.entry}
              tokens={byName}
              themes={themes}
              described={described.byName.get(item.entry.token.name)}
              unwritten={unwritten.has(item.entry.token.name)}
            />
          </div>
        )
      case "tiles":
        return (
          <div className="grid grid-cols-2 gap-1 px-3 pb-1">
            {item.entries.map((entry) => (
              <TokenTileButton
                key={entry.token.name}
                entry={entry}
                tokens={byName}
                themes={themes}
                width={tileWidth}
                unwritten={unwritten.has(entry.token.name)}
              />
            ))}
          </div>
        )
      case "hue":
        return (
          <div className="flex items-center gap-1.5 px-3 pb-1">
            <span className="w-14 shrink-0 truncate px-1 text-[11px] text-muted-foreground">{item.hue}</span>
            <div className="flex flex-1 gap-px">
              {item.shades.map((shade) => (
                <PaletteShade
                  key={shade.name}
                  token={shade}
                  value={comesTo(byName, shade.name) ?? ""}
                  unwritten={unwritten.has(shade.name)}
                />
              ))}
            </div>
          </div>
        )
      case "note":
        return <p className="px-4 pb-2 text-xs text-muted-foreground">{item.text}</p>
      case "described":
        return (
          <div className="px-3">
            <DescribedRow token={item.token} />
          </div>
        )
      case "end":
        return <div className="h-4" />
      case "empty":
        return <p className="p-6 text-center text-sm text-muted-foreground">No tokens match.</p>
    }
  }

  return (
    <>
      <div className="@container flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                const next = event.currentTarget.value
                if (Boolean(next.trim()) !== Boolean(needle)) setCollapsed(new Set())
                setQuery(next)
              }}
              placeholder="Search tokens"
              className="h-8 pl-8"
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={view}
            onValueChange={(value) => value && setView(value as View)}
            aria-label="Show tokens as"
          >
            <Hint label="List">
              <ToggleGroupItem value="list" aria-label="List" className="h-8 w-7 aria-checked:bg-muted">
                <List className="size-3.5" />
              </ToggleGroupItem>
            </Hint>
            <Hint label="Tiles">
              <ToggleGroupItem value="tiles" aria-label="Tiles" className="h-8 w-7 aria-checked:bg-muted">
                <LayoutGrid className="size-3.5" />
              </ToggleGroupItem>
            </Hint>
          </ToggleGroup>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={source}
          onValueChange={(value) => value && setSource(value as Source)}
          className="w-full"
        >
          <ToggleGroupItem value="all" className="h-7 min-w-0 flex-1 px-1.5 text-xs">
            All
          </ToggleGroupItem>
          <Hint label={`Semantic tokens, named for what they're for, ${counts.semantic}`} wait>
            <ToggleGroupItem value="semantic" className="h-7 min-w-0 flex-1 gap-1 px-1.5 text-xs aria-checked:bg-muted">
              <span className="truncate">Semantic</span>
              <SourceCount count={counts.semantic} />
            </ToggleGroupItem>
          </Hint>
          <Hint
            label={`Primitive tokens, the raw scale${info.styles ? ` from ${info.styles.name}'s theme` : ""}, ${counts.theme}`}
            wait
          >
            <ToggleGroupItem value="theme" className="h-7 min-w-0 flex-1 gap-1 px-1.5 text-xs aria-checked:bg-muted">
              <span className="truncate">Primitive</span>
              <SourceCount count={counts.theme} />
            </ToggleGroupItem>
          </Hint>
        </ToggleGroup>
        {failure && (
          <PanelError
            title={`Couldn't write ${failedNames(failure.tokens)} to ${store.stylesheet}`}
            action={
              <Button variant="outline" size="sm" onClick={() => void save(session)}>
                Try again
              </Button>
            }
          >
            {failure.error.replace(/[.\s]+$/, "")}. The canvas still shows the new values, unsaved.
          </PanelError>
        )}
        {info.styles?.error && <PanelError title="Some tokens may be missing">{info.styles.error}</PanelError>}
        {info.describedTokens
          ?.filter((source) => source.error)
          .map((source) => (
            <PanelError key={source.manifest} title={`Couldn't read the tokens in ${source.manifest}`}>
              {source.error}
            </PanelError>
          ))}
      </div>
      <Panel.Provider value={{ kinded, tokens: byName, themes, themeNames, described: described.byName, unwritten }}>
        <Keyframes.Provider value={store.keyframes}>
          <div ref={scroller} data-tokens-list className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((line) => (
                <div
                  key={line.key}
                  data-index={line.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${line.start}px)` }}
                >
                  {draw(items[line.index]!)}
                </div>
              ))}
            </div>
          </div>
        </Keyframes.Provider>
      </Panel.Provider>
    </>
  )
}

/**
 * The panel's lines, section by section in `tokenSections`' order. The project's colors come first, then the palette
 * as a grid of hues, or, while searching, its matches as rows, so a shade can be edited. In tiles, a kind with nothing
 * to draw stays in rows, as a tile of only a name says less than a row. A folded section is its title alone.
 */
function panelItems({
  matches,
  view,
  searching,
  unmatched,
  collapsed
}: {
  /** The tokens to list, in the order every list of them shares, which filtering keeps. */
  matches: Kinded[]
  view: View
  searching: boolean
  unmatched: LibraryToken[]
  /** The titles of the sections folded closed. */
  collapsed: ReadonlySet<string>
}): Item[] {
  const items: Item[] = []
  /** Adds a section's title, and says whether it's open, so its lines follow. */
  const section = (title: string, count: number) => {
    const open = !collapsed.has(title)
    items.push({ type: "section", key: `section ${title}`, title, count, first: items.length === 0, open })
    return open
  }
  const list = (entries: Kinded[], gap = false) => {
    if (view === "tiles" && entries.every((entry) => entry.kind !== "number")) {
      for (let index = 0; index < entries.length; index += 2) {
        const pair = entries.slice(index, index + 2)
        items.push({ type: "tiles", key: `tiles ${pair[0]!.token.name}`, entries: pair })
      }
      return
    }
    for (const [index, entry] of entries.entries()) {
      items.push({
        type: "row",
        key: `row ${entry.token.name}`,
        entry,
        gap: gap && index === 0
      })
    }
  }
  const end = (title: string) => items.push({ type: "end", key: `end ${title}` })

  for (const { title, kinds } of tokenSections) {
    const groups = kinds
      .map(({ kind, heading }) => ({ heading, entries: matches.filter((entry) => entry.kind === kind) }))
      .filter((group) => group.entries.length > 0)
    const count = groups.reduce((sum, group) => sum + group.entries.length, 0)
    if (count === 0) continue
    if (title === "Colors") {
      const own = groups[0]!.entries.filter((entry) => entry.token.source === "semantic")
      const scale = groups[0]!.entries.filter((entry) => entry.token.source === "theme")
      if (own.length > 0 && section("Semantic colors", own.length)) {
        list(own)
        end("Semantic colors")
      }
      if (scale.length > 0 && section("Palette", scale.length)) {
        if (searching) list(scale)
        else {
          const hues = Map.groupBy(scale, (entry) => /^color-([a-z]+)-\d+$/.exec(entry.token.name)?.[1] ?? "")
          const loose = hues.get("") ?? []
          hues.delete("")
          for (const [hue, shades] of hues) {
            items.push({ type: "hue", key: `hue ${hue}`, hue, shades: shades.map((entry) => entry.token) })
          }
          if (loose.length > 0) list(loose, hues.size > 0)
        }
        end("Palette")
      }
      continue
    }
    if (!section(title, count)) continue
    for (const [index, { heading, entries }] of groups.entries()) {
      if (heading && groups.length > 1) {
        items.push({ type: "heading", key: `heading ${title} ${heading}`, text: heading, first: index === 0 })
      }
      list(entries)
    }
    end(title)
  }
  if (unmatched.length > 0 && section("Described only", unmatched.length)) {
    items.push({
      type: "note",
      key: "note described only",
      text: "A .lib.par describes these, but no custom property in the stylesheet matches them, so frames can't use them."
    })
    for (const token of unmatched) {
      items.push({ type: "described", key: `described ${token.library}:${token.path}`, token })
    }
    end("Described only")
  }
  if (items.length === 0) items.push({ type: "empty", key: "empty" })
  return items
}

/** How many tokens a filter holds, shown only while the header is wide enough for it beside the filter's name. */
function SourceCount({ count }: { count: number }) {
  return <span className="hidden text-muted-foreground tabular-nums @[16rem]:inline">{count}</span>
}

/**
 * Keys on a token's row or tile: Ctrl+C, or Cmd+C on a Mac, copies its name, as a click does, and the right arrow opens
 * its detail with the keyboard in it, as resting the pointer on it opens it.
 */
function tokenKeys(copy: () => void, card: ReturnType<typeof useHoverCard>) {
  return (event: ReactKeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault()
      copy()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      card.openWithKeyboard()
    }
  }
}

/** Where a row or tile shows its value, a click on it says it copied, or couldn't, for a moment. */
function Copied({ copying }: { copying: ReturnType<typeof useCopy> }) {
  const ok = copying.status?.ok
  return (
    <span className={`flex items-center gap-0.5 ${ok ? "text-(--process-running)" : "text-destructive"}`}>
      {ok ? <Check className="size-3" /> : <X className="size-3" />}
      {ok ? "Copied" : "Couldn't copy"}
    </span>
  )
}

/**
 * A token's row: its preview, its name and what it comes to, in the unit people think in. Clicking it, or Ctrl+C,
 * copies its name, which Parity's fields take; resting the pointer on it opens its detail, where it can be edited.
 */
function TokenRow({
  entry,
  tokens,
  themes,
  described,
  unwritten = false
}: {
  entry: Kinded
  tokens: TokenMap
  themes: string[]
  /** What a `.lib.par` says about this token. */
  described?: LibraryToken
  /** Whether the last save couldn't write its value to the stylesheet. */
  unwritten?: boolean
}) {
  const { token, kind } = entry
  const preview = previewOf(entry, tokens, themes)
  const { playing, handlers } = useHoverPlay(kind)
  const copying = useCopy()
  const card = useHoverCard()
  const name = token.name
  const value = valueLabel(preview)
  return (
    <div {...handlers} className="group/token relative flex items-center">
      <TokenPopover entry={entry} card={card}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={card.open}
          aria-controls={card.open ? card.id : undefined}
          onClick={() => copying.copy(name)}
          onKeyDown={tokenKeys(() => copying.copy(name), card)}
          onPointerEnter={card.enter}
          onPointerLeave={card.leave}
          className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md py-1 pr-1.5 pl-1.5 text-left text-xs hover:bg-accent/50 aria-expanded:bg-accent"
        >
          <TokenGlyph
            token={preview}
            playing={playing}
            themes={kind === "color" ? themesOf(token, themes) : undefined}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-mono">{token.name}</span>
            {described?.description && (
              <span className="truncate text-[11px] text-muted-foreground">{described.description}</span>
            )}
            {unwritten && <span className="text-[11px] text-destructive">Not written to the stylesheet</span>}
          </span>
          {copying.status ? (
            <span className="shrink-0">
              <Copied copying={copying} />
            </span>
          ) : (
            value && (
              <span className="max-w-20 min-w-6 shrink-0 truncate text-right text-muted-foreground tabular-nums">
                {value}
              </span>
            )
          )}
        </button>
      </TokenPopover>
      <Announce status={copying.status} />
    </div>
  )
}

/** A token as a tile: a larger preview with its name and value under it. */
function TokenTileButton({
  entry,
  tokens,
  themes,
  width,
  unwritten = false
}: {
  entry: Kinded
  tokens: TokenMap
  themes: string[]
  /** The preview's width: its column's, so tiles side by side never overlap. */
  width: number
  unwritten?: boolean
}) {
  const { token, kind } = entry
  const preview = previewOf(entry, tokens, themes)
  const { playing, handlers } = useHoverPlay(kind)
  const copying = useCopy()
  const card = useHoverCard()
  const name = token.name
  const value = unwritten ? "Not written" : valueLabel(preview)
  return (
    <div {...handlers} className="group/token relative flex min-w-0">
      <TokenPopover entry={entry} card={card}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={card.open}
          aria-controls={card.open ? card.id : undefined}
          onClick={() => copying.copy(name)}
          onKeyDown={tokenKeys(() => copying.copy(name), card)}
          onPointerEnter={card.enter}
          onPointerLeave={card.leave}
          className="flex min-w-0 flex-1 flex-col gap-1 rounded-md p-1 text-left hover:bg-accent/50 aria-expanded:bg-accent"
        >
          <TokenTile token={preview} width={width} height={58} playing={playing} />
          <span className="flex min-w-0 items-baseline gap-1 px-0.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{token.name}</span>
            {copying.status ? (
              <span className="shrink-0 text-[10px]">
                <Copied copying={copying} />
              </span>
            ) : (
              value && (
                <span
                  className={`shrink-0 text-[10px] tabular-nums ${unwritten ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {value}
                </span>
              )
            )}
          </span>
        </button>
      </TokenPopover>
      <Announce status={copying.status} />
    </div>
  )
}

/**
 * A shade in the palette grid: its tooltip is its name, and a click copies that name, as there's little else to do with
 * one of 242. Hovered or focused, it rises above its neighbours with a ring set off by the panel's color, so the ring
 * shows whole on a light shade or a dark one. Searching lists the shades that match as rows, which open the editor.
 */
function PaletteShade({ token, value, unwritten }: { token: Token; value: string; unwritten: boolean }) {
  const name = token.name
  return (
    <CopyOnClick text={name} hint={name}>
      <button
        type="button"
        aria-label={`Copy ${name}`}
        className="relative h-5 flex-1 first-of-type:rounded-l-sm last-of-type:rounded-r-sm hover:z-10 hover:ring-1 hover:ring-foreground hover:ring-offset-1 hover:ring-offset-background focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        {/* The edge is its own layer, as the hover ring is the button's shadow; an unwritten shade's outline is on it,
            so the swatch never covers it. */}
        <span
          className={`pointer-events-none absolute inset-0 rounded-[inherit] ${
            unwritten ? "outline-2 -outline-offset-2 outline-destructive" : ""
          }`}
          style={swatch(value)}
        />
      </button>
    </CopyOnClick>
  )
}

/** A token a `.lib.par` describes but the stylesheet doesn't have, with its value in each context. */
function DescribedRow({ token }: { token: LibraryToken }) {
  const contexts = Object.entries(token.values)
  return (
    <div className="flex min-h-7 min-w-0 items-center gap-2 px-1.5 py-1 text-xs">
      {token.type === "color" ? (
        <span className="flex shrink-0">
          {contexts.map(([context, value]) => (
            <Hint key={context} label={`${context === "default" ? "Default" : context}: ${value}`} wait>
              <span className="size-4 first:rounded-l-sm last:rounded-r-sm" style={swatch(value)} />
            </Hint>
          ))}
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <Hint
        label={token.path}
        detail={[token.description, `${token.type ?? "Token"} from ${token.library}`].filter(Boolean).join("\n")}
        wait
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono">{token.path}</span>
          {token.description && <span className="truncate text-[11px] text-muted-foreground">{token.description}</span>}
        </span>
      </Hint>
      {token.type !== "color" && (
        <Hint label={token.values.default} wait>
          <span className="max-w-28 truncate text-muted-foreground">{token.values.default ?? contexts[0]?.[1]}</span>
        </Hint>
      )}
    </div>
  )
}

/**
 * A token's detail beside its row or tile, opened by resting the pointer on it, as a component's card is. Opened from
 * the keyboard, the keyboard goes into it and, when it closes, back to the row; opened by the pointer, focus stays where
 * it was.
 */
function TokenPopover({
  entry,
  card,
  children
}: {
  entry: Kinded
  card: ReturnType<typeof useHoverCard>
  children: React.ReactElement
}) {
  return (
    <Popover open={card.open} onOpenChange={card.setOpen} modal={false}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="right"
        sideOffset={12}
        id={card.id}
        onOpenAutoFocus={card.takesFocus}
        onCloseAutoFocus={card.returnFocus}
        onEscapeKeyDown={keepEditing}
        onInteractOutside={card.keepForItem}
        onPointerEnter={card.stay}
        onPointerLeave={card.leave}
        onFocusCapture={card.hold}
      >
        <Detail entry={entry} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A token's detail, mounted only while it's open, as it reads the rest of the token's scale. Apply changes the token
 * as one undoable step, unsaved until the project is saved; its Undo shows while that's still the last step.
 */
function Detail({ entry }: { entry: Kinded }) {
  const session = useProject()
  const { tokens: store } = session
  const panel = useContext(Panel)!
  const { undoLabel } = useHistory(session.store)
  const { token, kind } = entry
  const described = panel.described.get(token.name)
  // A theme the token sets no value in has the root's.
  const values = Object.fromEntries(
    themesOf(token, panel.themes).map((theme) => [theme, token.values[theme] ?? token.values.default ?? ""])
  )
  return (
    <TokenDetail
      token={{
        preview: previewOf(entry, panel.tokens, panel.themes),
        values,
        description: described?.description,
        library: described?.library,
        derived: token.derived,
        unwritten: panel.unwritten.has(token.name)
      }}
      themeNames={panel.themeNames}
      scale={panel.kinded
        .filter((other) => other.kind === kind)
        .map((other) => previewOf(other, panel.tokens, panel.themes))}
      stylesheet={store.stylesheet}
      lookup={(name, theme) => comesTo(panel.tokens, name, theme)}
      references={(name, theme) => {
        const other = panel.tokens.get(name)
        if (!other) return []
        const built = tokenReferences(other.values[theme] ?? other.values.default ?? "")
        return other.derived ? [other.derived.from, ...built] : built
      }}
      onApply={(changes) =>
        store.set(Object.entries(changes).map(([theme, value]) => ({ name: token.name, theme, value })))
      }
      undo={undoLabel === `Edit ${token.name}` ? () => session.store.undo() : undefined}
    />
  )
}

/** The tokens a save couldn't write, by name: one, or how many. */
function failedNames(changes: readonly TokenChange[]): string {
  const names = [...new Set(changes.map((change) => change.name))]
  return names.length === 1 ? names[0]! : `${names.length} tokens`
}
