import {
  type DescribedToken,
  type DescribedTokens,
  type PreviewKind,
  previewKind,
  substituteReferences,
  type Token
} from "@parity/core"
import { useVirtualizer } from "@tanstack/react-virtual"
import { LayoutGrid, List, Search } from "lucide-react"
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { TokenChange } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { useTokenFailure, useTokenList } from "../tokens-store.ts"
import { save } from "./commands.ts"
import { CopyButton, CopyOnClick, useCopy } from "./Copy.tsx"
import { Swatch } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { PanelError } from "./PanelError.tsx"
import { PanelSectionTitle } from "./PanelSection.tsx"
import {
  Keyframes,
  type PreviewToken,
  px,
  spacingSlot,
  TokenGlyph,
  tokenSections,
  TokenTile,
  useHoverPlay,
  valueLabel,
  valueProblem
} from "./token-previews.tsx"

type Source = "all" | "semantic" | "theme"
type View = "list" | "tiles"

/** A token a `.lib.par` describes, with the library that describes it. */
type Described = DescribedToken & { library: string }

/** A token with what its preview draws. */
interface Kinded {
  token: Token
  kind: PreviewKind
}

/** Tokens by name, to look up what a reference comes to. */
type TokenMap = ReadonlyMap<string, Token>

/**
 * The custom properties a described token is likely written as: its whole path, as in `color-primary`, or without its
 * first group, as in `primary`, which is how shadcn names them.
 */
function cssNames(path: string): string[] {
  const parts = path.split(".")
  return [parts.join("-"), parts.slice(1).join("-")].filter(Boolean)
}

/** Described tokens by the custom property each one matches, and the ones that match none. */
function matchDescribed(sources: DescribedTokens[] | undefined, tokens: Token[]) {
  const names = new Set(tokens.map((token) => token.name))
  const byName = new Map<string, Described>()
  const unmatched: Described[] = []
  for (const source of sources ?? []) {
    for (const token of source.tokens) {
      const described = { ...token, library: source.name }
      // A token that names its custom property matches it exactly; otherwise its path is the best guess.
      const candidates = token.parity?.var ? [token.parity.var] : cssNames(token.path)
      const name = candidates.find((candidate) => names.has(candidate))
      if (name) byName.set(name, described)
      else unmatched.push(described)
    }
  }
  return { byName, unmatched }
}

/**
 * What a token comes to in a theme, with every token it refers to filled in, as the browser would work it out: a step
 * of the spacing scale comes to pixels. Undefined when there's no token of that name.
 */
function comesTo(tokens: TokenMap, name: string, theme = "default", depth = 0): string | undefined {
  const token = tokens.get(name)
  if (!token) return undefined
  const value = token.values[theme] ?? token.values.default ?? ""
  if (depth > 8) return value
  if (token.derived) {
    const base = px(comesTo(tokens, token.derived.from, theme, depth + 1) ?? "")
    if (Number.isFinite(base)) return `${Number((base * token.derived.factor).toFixed(2))}px`
  }
  return substituteReferences(value, (reference) => comesTo(tokens, reference, theme, depth + 1))
}

/** The themes a token has a value in: every theme for the project's own tokens, the root for the theme's scale. */
function themesOf(token: Token, themes: string[]): string[] {
  return token.source === "semantic" ? themes : ["default"]
}

/** A token as its preview draws it: what it comes to in each of its themes. */
function previewOf({ token, kind }: Kinded, tokens: TokenMap, themes: string[]): PreviewToken {
  const values = Object.fromEntries(
    themesOf(token, themes).map((theme) => [theme, comesTo(tokens, token.name, theme) ?? ""])
  )
  return { name: token.name, kind, values }
}

/** One line of the virtualized list: a section's title, a kind's heading under it, a row, tiles or a palette hue. */
type Item =
  | { type: "section"; key: string; title: string; count: number; first: boolean }
  | { type: "heading"; key: string; text: string; first: boolean }
  | { type: "row"; key: string; entry: Kinded; slot?: number; gap?: boolean }
  | { type: "tiles"; key: string; entries: Kinded[] }
  | { type: "hue"; key: string; hue: string; shades: Token[] }
  | { type: "note"; key: string; text: string }
  | { type: "described"; key: string; token: Described }
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
  const needle = query.trim().toLowerCase()
  const byName = useMemo(() => new Map(tokens.map((token) => [token.name, token])), [tokens])
  const themes = useMemo(() => [...new Set(tokens.flatMap((token) => Object.keys(token.values)))], [tokens])
  const described = useMemo(() => matchDescribed(info.describedTokens, tokens), [info.describedTokens, tokens])
  const kinded = useMemo(
    () => tokens.map((token) => ({ token, kind: previewKind(token, described.byName.get(token.name)?.type) })),
    [tokens, described]
  )
  const matches = kinded.filter(
    ({ token }) =>
      (source === "all" || token.source === source) && (!needle || token.name.toLowerCase().includes(needle))
  )
  const counts = { semantic: tokens.filter((t) => t.source === "semantic").length, theme: 0 }
  counts.theme = tokens.length - counts.semantic
  const unmatched = described.unmatched.filter((token) => !needle || token.path.toLowerCase().includes(needle))
  const items = panelItems({
    matches,
    view,
    searching: Boolean(needle),
    unmatched: source === "all" ? unmatched : [],
    spacing: (list) => spacingSlot(list.map((entry) => previewOf(entry, byName, themes)))
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

  const draw = (item: Item): ReactNode => {
    switch (item.type) {
      case "section":
        return (
          <div className={`px-3 pt-4 ${item.first ? "" : "border-t"}`}>
            <PanelSectionTitle title={item.title} count={item.count} />
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
              slot={item.slot}
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
                unwritten={unwritten.has(entry.token.name)}
              />
            ))}
          </div>
        )
      case "hue":
        return (
          <div className="flex items-center gap-1.5 px-3 pb-1">
            <span className="w-14 shrink-0 truncate px-1 text-[11px] text-muted-foreground">{item.hue}</span>
            <div className="flex flex-1 gap-px overflow-hidden rounded-sm">
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
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={`Search ${tokens.length} tokens`}
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
          <ToggleGroupItem value="all" className="h-7 flex-1 text-xs">
            All
          </ToggleGroupItem>
          <Hint label="The project's own variables" wait>
            <ToggleGroupItem value="semantic" className="h-7 flex-1 text-xs aria-checked:bg-muted">
              Project {counts.semantic}
            </ToggleGroupItem>
          </Hint>
          <Hint label={info.styles ? `${info.styles.name}'s theme` : "Theme scale"} wait>
            <ToggleGroupItem value="theme" className="h-7 flex-1 text-xs aria-checked:bg-muted">
              Theme {counts.theme}
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
    </>
  )
}

/**
 * The panel's lines, section by section in `tokenSections`' order. The project's colors come first, then the palette
 * as a grid of hues, or, while searching, its matches as rows, so a shade can be edited. In tiles, a kind with nothing
 * to draw stays in rows, as a tile of only a name says less than a row.
 */
function panelItems({
  matches,
  view,
  searching,
  unmatched,
  spacing
}: {
  matches: Kinded[]
  view: View
  searching: boolean
  unmatched: Described[]
  /** How wide a list's spacing previews are. */
  spacing(list: Kinded[]): number | undefined
}): Item[] {
  const items: Item[] = []
  const section = (title: string, count: number) =>
    items.push({ type: "section", key: `section ${title}`, title, count, first: items.length === 0 })
  const list = (entries: Kinded[], gap = false) => {
    if (view === "tiles" && entries.every((entry) => entry.kind !== "number")) {
      for (let index = 0; index < entries.length; index += 2) {
        const pair = entries.slice(index, index + 2)
        items.push({ type: "tiles", key: `tiles ${pair[0]!.token.name}`, entries: pair })
      }
      return
    }
    const slot = entries.some((entry) => entry.kind === "spacing") ? spacing(entries) : undefined
    for (const [index, entry] of entries.entries()) {
      items.push({
        type: "row",
        key: `row ${entry.token.name}`,
        entry,
        slot: entry.kind === "spacing" ? slot : undefined,
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
      if (own.length > 0) {
        section("Project colors", own.length)
        list(own)
        end("Project colors")
      }
      if (scale.length > 0) {
        section("Palette", scale.length)
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
    section(title, count)
    for (const [index, { heading, entries }] of groups.entries()) {
      if (heading && groups.length > 1) {
        items.push({ type: "heading", key: `heading ${title} ${heading}`, text: heading, first: index === 0 })
      }
      list(entries)
    }
    end(title)
  }
  if (unmatched.length > 0) {
    section("Described only", unmatched.length)
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

/** Ctrl+C, or Cmd+C on a Mac, on a token's row or tile copies its name, as its copy button does. */
function copyKey(copy: () => void) {
  return (event: ReactKeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault()
      copy()
    }
  }
}

/** A row's or tile's copy button shows while it's hovered or has the keyboard, and stays while it says how it went. */
function revealed(copying: ReturnType<typeof useCopy>): string {
  return copying.status
    ? ""
    : "opacity-0 group-focus-within/token:opacity-100 group-hover/token:opacity-100 focus-visible:opacity-100"
}

/**
 * A token's row: its preview, its name and what it comes to, in the unit people think in. Clicking it opens its
 * editor; its copy button, or Ctrl+C, copies its name as CSS writes it (`--radius-md`), which Parity's fields take.
 */
function TokenRow({
  entry,
  tokens,
  themes,
  described,
  unwritten = false,
  slot
}: {
  entry: Kinded
  tokens: TokenMap
  themes: string[]
  /** What a `.lib.par` says about this token. */
  described?: Described
  /** Whether the last save couldn't write its value to the stylesheet. */
  unwritten?: boolean
  /** How wide the preview is, when its section's previews need more than the usual box. */
  slot?: number
}) {
  const { token, kind } = entry
  const preview = previewOf(entry, tokens, themes)
  const { playing, handlers } = useHoverPlay(kind)
  const copying = useCopy()
  const name = `--${token.name}`
  const value = valueLabel(preview)
  return (
    <div {...handlers} className="group/token relative flex items-center">
      <TokenEditor entry={entry} tokens={tokens} themes={themes}>
        <Hint label={described?.description ? `${described.description} (${described.library})` : undefined} wait>
          <button
            type="button"
            onKeyDown={copyKey(() => copying.copy(name))}
            className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-left text-xs group-hover/token:bg-accent/50 aria-expanded:bg-accent"
          >
            <TokenGlyph
              token={preview}
              playing={playing}
              themes={kind === "color" ? themesOf(token, themes) : undefined}
              width={slot}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono">{token.name}</span>
              {described?.description && (
                <span className="truncate text-[11px] text-muted-foreground">{described.description}</span>
              )}
              {unwritten && <span className="text-[11px] text-destructive">Not written to the stylesheet</span>}
            </span>
            {value && <span className="max-w-20 shrink-0 truncate text-muted-foreground tabular-nums">{value}</span>}
          </button>
        </Hint>
      </TokenEditor>
      <CopyButton text={name} copying={copying} className={`absolute right-1 size-6 ${revealed(copying)}`} />
    </div>
  )
}

/** A token as a tile: a larger preview with its name and value under it. */
function TokenTileButton({
  entry,
  tokens,
  themes,
  unwritten = false
}: {
  entry: Kinded
  tokens: TokenMap
  themes: string[]
  unwritten?: boolean
}) {
  const { token, kind } = entry
  const preview = previewOf(entry, tokens, themes)
  const { playing, handlers } = useHoverPlay(kind)
  const copying = useCopy()
  const name = `--${token.name}`
  const value = unwritten ? "Not written" : valueLabel(preview)
  return (
    <div {...handlers} className="group/token relative flex min-w-0">
      <TokenEditor entry={entry} tokens={tokens} themes={themes}>
        <button
          type="button"
          onKeyDown={copyKey(() => copying.copy(name))}
          className="flex min-w-0 flex-1 flex-col gap-1 rounded-md p-1 text-left group-hover/token:bg-accent/50 aria-expanded:bg-accent"
        >
          <TokenTile token={preview} width={120} height={58} playing={playing} />
          <span className="flex min-w-0 items-baseline gap-1 px-0.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{token.name}</span>
            {value && (
              <span
                className={`shrink-0 text-[10px] tabular-nums ${unwritten ? "text-destructive" : "text-muted-foreground"}`}
              >
                {value}
              </span>
            )}
          </span>
        </button>
      </TokenEditor>
      <CopyButton
        text={name}
        copying={copying}
        className={`absolute top-2 right-2 size-6 bg-popover/90 shadow-sm hover:bg-popover ${revealed(copying)}`}
      />
    </div>
  )
}

/**
 * A shade in the palette grid: a click copies its name, as there's little else to do with one of 242. Searching lists
 * the shades that match as rows, which open the editor.
 */
function PaletteShade({ token, value, unwritten }: { token: Token; value: string; unwritten: boolean }) {
  const name = `--${token.name}`
  return (
    <CopyOnClick
      text={name}
      hint={`${token.name}: ${value}${unwritten ? ", not written to the stylesheet" : ""}`}
      detail="Click to copy"
    >
      <button
        type="button"
        aria-label={`Copy ${name}`}
        className={`h-5 flex-1 hover:outline-2 hover:outline-offset-1 hover:outline-foreground ${
          unwritten ? "outline-2 -outline-offset-2 outline-destructive" : ""
        }`}
        style={{ background: value }}
      />
    </CopyOnClick>
  )
}

/** A token a `.lib.par` describes but the stylesheet doesn't have, with its value in each context. */
function DescribedRow({ token }: { token: Described }) {
  const contexts = Object.entries(token.values)
  return (
    <div className="flex min-h-7 min-w-0 items-center gap-2 px-1.5 py-1 text-xs">
      {token.type === "color" ? (
        <span className="flex shrink-0">
          {contexts.map(([context, value]) => (
            <Hint key={context} label={`${context === "default" ? "Default" : context}: ${value}`} wait>
              <span
                className="size-4 border border-white/15 first:rounded-l-sm last:rounded-r-sm"
                style={{ background: value }}
              />
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

/** Edits one token's value in each theme it has. */
function TokenEditor({
  entry,
  tokens,
  themes,
  children
}: {
  entry: Kinded
  tokens: TokenMap
  themes: string[]
  children: React.ReactElement
}) {
  const { tokens: store } = useProject()
  const [open, setOpen] = useState(false)
  const [problems, setProblems] = useState<Record<string, string>>({})
  const { token, kind } = entry
  const editable = themesOf(token, themes)
  const opened = (next: boolean) => {
    setOpen(next)
    if (next) setProblems({})
  }

  if (token.derived) {
    return (
      <Popover open={open} onOpenChange={opened}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-72" align="start" side="right">
          <div className="font-mono text-sm font-medium">{token.name}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {token.derived.factor} steps of <code>--{token.derived.from}</code>, {comesTo(tokens, token.name)}. It
            follows the scale: change <code>--{token.derived.from}</code> to resize every step.
          </p>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={opened}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="start" side="right">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const changes = editable.flatMap((theme) => {
              const value = String(data.get(theme) ?? "").trim()
              const current = token.values[theme] ?? ""
              return value && value !== current ? [{ name: token.name, theme, value }] : []
            })
            // A value refers to tokens by what they come to in its own theme.
            const found = Object.fromEntries(
              changes.flatMap((change) => {
                const problem = valueProblem(kind, change.value, (name) => comesTo(tokens, name, change.theme))
                return problem ? [[change.theme, problem]] : []
              })
            )
            setProblems(found)
            if (Object.keys(found).length > 0) return
            store.set(changes)
            setOpen(false)
          }}
        >
          <div>
            <div className="font-mono text-sm font-medium">--{token.name}</div>
            <div className="text-xs text-muted-foreground">
              {token.source === "semantic" ? "Project token" : "Theme scale"} with {kind.replaceAll("-", " ")} values
            </div>
          </div>
          {editable.map((theme) => (
            <label key={theme} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {theme === "default" ? "Light (root)" : `Theme .${theme}`}
              </span>
              <span className="flex items-center gap-2">
                {kind === "color" && <Swatch value={comesTo(tokens, token.name, theme) ?? ""} className="size-7" />}
                <Input
                  name={theme}
                  defaultValue={token.values[theme] ?? ""}
                  aria-invalid={problems[theme] ? true : undefined}
                  className="h-8 font-mono text-xs"
                />
              </span>
              {problems[theme] && <span className="text-xs text-destructive">{problems[theme]}</span>}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Every frame shows it at once. Saving the project writes it to {store.stylesheet}, and Undo takes it back.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** The tokens a save couldn't write, by name: one, or how many. */
function failedNames(changes: readonly TokenChange[]): string {
  const names = [...new Set(changes.map((change) => change.name))]
  return names.length === 1 ? `--${names[0]}` : `${names.length} tokens`
}
