import {
  Check,
  ChevronsUpDown,
  CornerDownRight,
  LayoutGrid,
  List,
  Pause,
  Pencil,
  Play,
  Search,
  Undo2
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, Swatch } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import {
  allTokens,
  breakpoints,
  drawn,
  durations,
  easings,
  ms,
  type PreviewKind,
  px,
  references,
  type SampleToken,
  substituted,
  token as tokenNamed,
  tokenSections,
  tokensOfKind,
  zIndexes
} from "./preview-data.ts"
import {
  AnimationArt,
  DurationArt,
  EasingArt,
  onPaper,
  paper,
  rest,
  SpacingBar,
  TokenArt,
  TokenGlyph,
  TokenTile,
  useReducedMotion,
  valueLabel,
  valueProblem
} from "./token-art.tsx"

/** Kinds that move, and so play while hovered, focused or open. */
export const moving = new Set<PreviewKind>(["duration", "easing", "animation"])

const themesOf = (token: SampleToken) => (token.source === "semantic" ? Object.keys(token.values) : ["default"])

/**
 * Plays a token's motion while the pointer or keyboard is on it, unless the computer asks for reduced motion. `forced`
 * holds it playing, for stories that show a hovered row.
 */
function useHoverPlay(token: SampleToken, forced = false) {
  const reduced = useReducedMotion()
  const [hovered, setHovered] = useState(false)
  const playing = moving.has(token.kind) && !reduced && (hovered || forced)
  const on = () => setHovered(true)
  const off = () => setHovered(false)
  return { playing, handlers: { onPointerEnter: on, onPointerLeave: off, onFocus: on, onBlur: off } }
}

/** A token as edited: a changed value draws as typed, so its previews show what every frame now shows. */
function edited(token: SampleToken, values: Record<string, string>): SampleToken {
  if (Object.entries(values).every(([theme, value]) => token.values[theme] === value)) return token
  const value = substituted(values.default ?? "")
  // A length the token showed in pixels still comes to pixels, as the browser works it out.
  const length = token.resolved?.endsWith("px") ? px(value) : Number.NaN
  const resolved = Number.isFinite(length) ? `${Number(length.toFixed(2))}px` : value
  return { ...token, values, resolved, via: references(values.default ?? "") }
}

/** A token's row in the panel: its preview, name and value. Clicking it opens its detail and editor. */
export function TokenRow({
  token: original,
  playing: forced,
  open,
  slot
}: {
  token: SampleToken
  playing?: boolean
  open?: boolean
  /** How wide the preview is, when its section's previews need more than the usual box. */
  slot?: number
}) {
  const [values, setValues] = useState(original.values)
  const token = edited(original, values)
  const { playing, handlers } = useHoverPlay(token, forced)
  const value = valueLabel(token)
  return (
    <li>
      <Popover defaultOpen={open}>
        <PopoverTrigger asChild>
          <button
            type="button"
            {...handlers}
            className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent/50 aria-expanded:bg-accent"
          >
            <TokenGlyph
              token={token}
              playing={playing}
              themes={token.kind === "color" ? themesOf(token) : undefined}
              width={slot}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono">{token.name}</span>
              {token.description && (
                <span className="truncate text-[11px] text-muted-foreground">{token.description}</span>
              )}
            </span>
            {value && <span className="max-w-20 shrink-0 truncate text-muted-foreground tabular-nums">{value}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="right" sideOffset={12} onEscapeKeyDown={keepEditing}>
          <TokenDetail token={original} values={values} onValues={setValues} />
        </PopoverContent>
      </Popover>
    </li>
  )
}

/** A token as a tile: a larger preview with its name and value under it. */
function TokenTileButton({ token: original, playing: forced }: { token: SampleToken; playing?: boolean }) {
  const [values, setValues] = useState(original.values)
  const token = edited(original, values)
  const { playing, handlers } = useHoverPlay(token, forced)
  const value = valueLabel(token)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...handlers}
          className="flex min-w-0 flex-col gap-1 rounded-md p-1 text-left hover:bg-accent/50 aria-expanded:bg-accent"
        >
          {token.kind === "color" ? (
            <span className="flex h-[58px] w-full overflow-hidden rounded-md border border-white/10">
              {themesOf(token).map((theme) => (
                <span key={theme} className="flex-1">
                  <TokenArt token={token} width={60} height={58} theme={theme} />
                </span>
              ))}
            </span>
          ) : (
            <TokenTile token={token} width={120} height={58} playing={playing} />
          )}
          <span className="flex min-w-0 items-baseline gap-1 px-0.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{token.name}</span>
            {value && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{value}</span>}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="right" sideOffset={12} onEscapeKeyDown={keepEditing}>
        <TokenDetail token={original} values={values} onValues={setValues} />
      </PopoverContent>
    </Popover>
  )
}

/** Tailwind's palette as a grid: one row per hue, its shades across, as the panel draws it today. */
function PaletteGrid({ tokens }: { tokens: SampleToken[] }) {
  const hues = Map.groupBy(tokens, (token) => /^color-([a-z]+)-\d+$/.exec(token.name)?.[1] ?? "")
  return (
    <div className="flex flex-col gap-1">
      {[...hues].map(([hue, shades]) => (
        <div key={hue} className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 truncate text-[11px] text-muted-foreground">{hue}</span>
          <div className="flex flex-1 gap-px overflow-hidden rounded-sm">
            {shades.map((shade) => (
              <Hint key={shade.name} label={`${shade.name}: ${shade.values.default}`}>
                <button
                  type="button"
                  aria-label={shade.name}
                  className="h-5 flex-1 hover:outline-2 hover:outline-offset-1 hover:outline-foreground"
                  style={{ background: shade.values.default }}
                />
              </Hint>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

type Source = "all" | "semantic" | "theme"

/**
 * The Tokens tab with a preview for every kind: rows by default, or tiles for a closer look. Sections follow what a
 * token is for, so Other no longer holds z-indexes and border widths, and Effects is split into blur, aspect ratios
 * and perspective.
 */
export function TokensPanel({
  view: initialView = "list",
  query: initialQuery = "",
  playing,
  open,
  only
}: {
  view?: "list" | "tiles"
  query?: string
  /** A token shown as hovered, so its motion plays. */
  playing?: string
  /** A token whose detail shows open. */
  open?: string
  /** Only these sections, for a story that looks at a few. */
  only?: string[]
}) {
  const [view, setView] = useState(initialView)
  const [query, setQuery] = useState(initialQuery)
  const [source, setSource] = useState<Source>("all")
  const needle = query.trim().toLowerCase()
  const matches = allTokens.filter(
    (token) => (source === "all" || token.source === source) && (!needle || token.name.toLowerCase().includes(needle))
  )
  const project = allTokens.filter((token) => token.source === "semantic").length
  return (
    <>
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={`Search ${allTokens.length} tokens`}
              className="h-8 pl-8"
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={view}
            onValueChange={(value) => value && setView(value as "list" | "tiles")}
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
        <div className="flex items-center gap-1.5">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={source}
            onValueChange={(value) => value && setSource(value as Source)}
            className="min-w-0 flex-1"
          >
            <ToggleGroupItem value="all" className="h-7 flex-1 text-xs">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="semantic" className="h-7 flex-1 text-xs aria-checked:bg-muted">
              Project {project}
            </ToggleGroupItem>
            <ToggleGroupItem value="theme" className="h-7 flex-1 text-xs aria-checked:bg-muted">
              Theme {allTokens.length - project}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {tokenSections
          .filter((section) => !only || only.includes(section.title))
          .map((section) => {
            const groups = section.kinds
              .map(({ kind, heading }) => ({ heading, list: tokensOfKind(kind, matches) }))
              .filter((group) => group.list.length > 0)
            const count = groups.reduce((sum, group) => sum + group.list.length, 0)
            if (count === 0) return null
            if (section.title === "Colors") {
              const own = groups[0]!.list.filter((token) => token.source === "semantic")
              const scale = groups[0]!.list.filter((token) => token.source === "theme")
              return (
                <div key="colors">
                  {own.length > 0 && (
                    <PanelSection title="Project colors" count={own.length}>
                      <TokenList tokens={own} view={view} playing={playing} open={open} />
                    </PanelSection>
                  )}
                  {scale.length > 0 && (
                    <PanelSection title="Palette" count={scale.length}>
                      <PaletteGrid tokens={scale} />
                    </PanelSection>
                  )}
                </div>
              )
            }
            return (
              <PanelSection key={section.title} title={section.title} count={count}>
                <div className="flex flex-col gap-2">
                  {groups.map(({ heading, list }) => (
                    <div key={heading ?? section.title}>
                      {heading && groups.length > 1 && (
                        <div className="px-1.5 pb-0.5 text-[11px] text-muted-foreground">{heading}</div>
                      )}
                      <TokenList tokens={list} view={view} playing={playing} open={open} />
                    </div>
                  ))}
                </div>
              </PanelSection>
            )
          })}
        {matches.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No tokens match.</p>}
      </div>
    </>
  )
}

function TokenList({
  tokens,
  view,
  playing,
  open
}: {
  tokens: SampleToken[]
  view: "list" | "tiles"
  playing?: string
  open?: string
}) {
  // A kind with nothing to draw stays a row, as a tile of only a name says less than the row does.
  if (view === "tiles" && tokens.every((token) => token.kind !== "number")) {
    return (
      <div className="grid grid-cols-2 gap-1">
        {tokens.map((token) => (
          <TokenTileButton key={token.name} token={token} playing={token.name === playing} />
        ))}
      </div>
    )
  }
  const slot = spacingSlot(tokens)
  return (
    <ul className="flex flex-col">
      {tokens.map((token) => (
        <TokenRow
          key={token.name}
          token={token}
          playing={token.name === playing}
          open={token.name === open}
          slot={token.kind === "spacing" ? slot : undefined}
        />
      ))}
    </ul>
  )
}

/** The longest length a spacing row draws at its true size; a longer one is drawn cut, with a break in its bar. */
const longestBar = 128

/**
 * How wide spacing rows' previews are: as wide as the section's longest length, so every bar is its true size, up to
 * `longestBar`. Names still line up within the section.
 */
function spacingSlot(tokens: SampleToken[]): number | undefined {
  const lengths = tokens.filter((token) => token.kind === "spacing").map((token) => px(drawn(token)))
  const longest = Math.max(0, ...lengths.filter(Number.isFinite))
  return lengths.length > 0 ? Math.min(longestBar + 4, Math.max(40, Math.ceil(longest) + 6)) : undefined
}

/** Where a token's value comes from: each token it goes through, then what it comes to. */
function References({ token }: { token: SampleToken }) {
  if (!token.via?.length) return null
  return (
    <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
      {token.via.map((name) => (
        <span key={name} className="flex items-center gap-1">
          <CornerDownRight className="size-3" />
          <span className="font-mono text-foreground">--{name}</span>
          <span className="truncate">{tokenNamed(name).values.default}</span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <CornerDownRight className="size-3" />
        Comes to <span className="font-mono text-foreground">{token.resolved}</span>
      </span>
    </div>
  )
}

/** What kind of token it is and where it's from, in words. */
function origin(token: SampleToken): string {
  const kind = tokenSections.find((section) => section.kinds.some((entry) => entry.kind === token.kind))
  const heading = kind?.kinds.find((entry) => entry.kind === token.kind)?.heading
  const what = heading && kind!.kinds.length > 1 ? `${kind!.title}, ${heading.toLowerCase()}` : (kind?.title ?? "Token")
  if (token.library) return `${what} from ${token.library}`
  return `${what}, ${token.source === "semantic" ? "the project's own" : "theme scale"}`
}

/**
 * A token's detail, opened from its row: a large preview, what it's from and what it comes to, and its value, which is
 * read-only until Edit. Editing checks each value as it's typed and writes nothing until Save; Cancel or Escape leaves
 * without writing. After a save the detail says where it went, with Undo to write the old value back. Motion plays while
 * the detail is open, with a button to stop it; with reduced motion it waits for Play.
 */
export function TokenDetail({
  token,
  editor = true,
  values: given,
  onValues,
  draft: initialDraft
}: {
  token: SampleToken
  editor?: boolean
  /** Its saved values, when what opened it shows them too; otherwise the detail keeps its own. */
  values?: Record<string, string>
  onValues?(values: Record<string, string>): void
  /** Opens it already editing, with these values typed, for a story. */
  draft?: Record<string, string>
}) {
  const reduced = useReducedMotion()
  const [play, setPlay] = useState<boolean>()
  const [own, setOwn] = useState(token.values)
  const saved = given ?? own
  const save = onValues ?? setOwn
  const [drafts, setDrafts] = useState(initialDraft)
  // What the last save replaced, for Undo.
  const [replaced, setReplaced] = useState<Record<string, string>>()
  const themes = themesOf(token)
  const problems: Record<string, string | undefined> = Object.fromEntries(
    themes.map((theme) => [theme, drafts ? valueProblem(token.kind, drafts[theme] ?? "") : undefined])
  )
  const valid = themes.every((theme) => !problems[theme])
  const changed = drafts !== undefined && themes.some((theme) => (drafts[theme] ?? "").trim() !== saved[theme])
  // While editing, the preview follows what's typed, as long as it's a value it can draw.
  const shown = edited(token, drafts && valid ? trimmed(drafts) : saved)
  const playing = moving.has(token.kind) && (play ?? !reduced)
  const cancel = () => setDrafts(undefined)
  return (
    <div className="flex flex-col">
      <div className="p-3 pb-2">
        <DetailPreview token={shown} playing={playing} />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm font-medium">--{token.name}</div>
            <div className="text-xs text-muted-foreground">{origin(token)}</div>
          </div>
          {moving.has(token.kind) && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPlay(!playing)}>
              {playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play"}
            </Button>
          )}
        </div>
        {token.description && <p className="text-xs">{token.description}</p>}
        <References token={shown} />
        {token.uses !== undefined && (
          <p className="text-[11px] text-muted-foreground">
            {token.uses === 0 ? "No design uses it yet." : `Used by ${token.uses} layers across the project's designs.`}
          </p>
        )}
      </div>
      {editor && !drafts && (
        <div className="flex flex-col gap-1.5 border-t p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Value</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setDrafts(saved)
                setReplaced(undefined)
              }}
            >
              <Pencil /> Edit
            </Button>
          </div>
          {themes.map((theme) => (
            <div key={theme} className="flex items-baseline gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">{themeLabel(theme)}</span>
              <code className="min-w-0 flex-1 font-mono break-all">{saved[theme]}</code>
            </div>
          ))}
          {replaced && (
            <div className="mt-1 flex items-center gap-2 rounded-md bg-muted/60 py-1 pr-1 pl-2 text-[11px]">
              <Check className="size-3.5 shrink-0 text-(--process-running)" />
              <span className="min-w-0 flex-1 text-muted-foreground">Saved to {stylesheet}.</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  save(replaced)
                  setReplaced(undefined)
                }}
              >
                <Undo2 /> Undo
              </Button>
            </div>
          )}
        </div>
      )}
      {editor && drafts && (
        <form
          data-token-editing
          className="flex flex-col gap-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!changed || !valid) return
            setReplaced(saved)
            save(trimmed(drafts))
            setDrafts(undefined)
          }}
        >
          {themes.map((theme, index) => (
            <label key={theme} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{themeLabel(theme)}</span>
              <span className="flex items-center gap-2">
                {token.kind === "color" && !problems[theme] && (
                  <Swatch value={drafts[theme] ?? ""} className="size-7" />
                )}
                <Input
                  value={drafts[theme] ?? ""}
                  // The form opens because Edit was pressed, so its first field takes the keyboard.
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={index === 0}
                  aria-invalid={problems[theme] ? true : undefined}
                  onChange={(event) => setDrafts({ ...drafts, [theme]: event.currentTarget.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") cancel()
                  }}
                  className="h-8 font-mono text-xs"
                />
              </span>
              {problems[theme] && <span className="text-[11px] text-destructive">{problems[theme]}</span>}
            </label>
          ))}
          <p className="text-[11px] text-muted-foreground">
            {!valid
              ? "Fix the value to save it."
              : changed
                ? `Not saved yet. Save writes it to ${stylesheet}.`
                : "Nothing is written until you save."}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!changed || !valid}>
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Where the example's tokens are written. */
const stylesheet = "src/index.css"

const themeLabel = (theme: string) => (theme === "default" ? "Light (root)" : `Theme .${theme}`)

function trimmed(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([theme, value]) => [theme, value.trim()]))
}

/**
 * Escape in a field being edited leaves editing, which the field handles, rather than closing the detail. From the
 * buttons, Escape closes the detail, which writes nothing either.
 */
function keepEditing(event: KeyboardEvent): void {
  if (event.target instanceof Element && event.target.matches("[data-token-editing] input")) event.preventDefault()
}

/** The detail's large preview: the tile for most kinds, and for a few, the token among the rest of its scale. */
function DetailPreview({ token, playing }: { token: SampleToken; playing: boolean }) {
  const width = 296
  switch (token.kind) {
    case "color":
      return (
        <div className="flex h-24 overflow-hidden rounded-md border border-white/10">
          {themesOf(token).map((theme) => (
            <div key={theme} className="relative flex-1">
              <TokenArt token={token} width={width / themesOf(token).length} height={96} theme={theme} />
              <span
                className="absolute bottom-1.5 left-2 rounded px-1 font-mono text-[10px]"
                style={{ background: "rgb(0 0 0 / 0.55)", color: "white" }}
              >
                {theme === "default" ? "Light" : "Dark"} {token.values[theme]}
              </span>
            </div>
          ))}
        </div>
      )
    case "spacing":
      return <SpacingScale token={token} width={width} />
    case "duration":
      return <DurationRace token={token} playing={playing} width={width} />
    case "easing":
      return (
        <div className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
          <EasingArt
            value={drawn(token)}
            width={width - 26}
            height={110}
            playing={playing}
            duration={700}
            stroke={2}
            ghosts={easings.filter((other) => other !== token).map((other) => drawn(other))}
          />
        </div>
      )
    case "animation":
      return (
        <div className="grid h-28 place-items-center rounded-md border bg-muted/40 text-muted-foreground">
          <AnimationArt value={drawn(token)} size={72} playing={playing} />
        </div>
      )
    case "font":
    case "font-size":
      return <TypeSpecimen token={token} width={width} />
    case "z-index":
      return <LayerStack token={token} />
    case "breakpoint":
      return <BreakpointRuler token={token} width={width} />
    default:
      return <TokenTile token={token} width={width} height={120} playing={playing} />
  }
}

/**
 * Every step of the spacing scale at its true size, as the rows draw them, with this one marked, so its length reads
 * against the rest. While editing, its bar follows what's typed.
 */
function SpacingScale({ token, width }: { token: SampleToken; width: number }) {
  const steps = tokensOfKind("spacing").filter((step) => step.library === token.library)
  const scale = steps.some((step) => step.name === token.name) ? steps : [token]
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/40 px-3 py-2">
      {scale.map((step) => {
        const current = step.name === token.name
        const length = px(drawn(current ? token : step))
        return (
          <div key={step.name} className="flex h-4 items-center gap-2">
            <span
              className={`w-24 shrink-0 truncate font-mono text-[10px] ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {step.name}
            </span>
            <SpacingBar length={length} room={width - 26 - 104} dim={!current} />
          </div>
        )
      })}
    </div>
  )
}

/** Every duration in the scale side by side, setting off together, so this one's speed reads against the others. */
function DurationRace({ token, playing, width }: { token: SampleToken; playing: boolean; width: number }) {
  const scale = token.library ? durations.filter((other) => other.library === token.library) : [token]
  const period = Math.max(...scale.map((other) => ms(drawn(other)))) + rest
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2">
      {scale.map((other) => (
        <div
          key={other.name}
          className={`flex items-center gap-2 ${other === token ? "text-foreground" : "text-muted-foreground/60"}`}
        >
          <span className="w-10 shrink-0 text-right text-[10px] tabular-nums">{other.values.default}</span>
          <DurationArt value={drawn(other)} width={width - 80} height={12} playing={playing} period={period} />
        </div>
      ))}
    </div>
  )
}

/** A font or size set in the project's type: a large sample and a line of text, at its paired line height. */
function TypeSpecimen({ token, width }: { token: SampleToken; width: number }) {
  const size = token.kind === "font-size" ? px(drawn(token)) : 15
  const family = token.kind === "font" ? drawn(token) : "'Geist Variable', sans-serif"
  return (
    <div
      className="flex flex-col gap-2 overflow-hidden rounded-md border p-3"
      style={{ width, background: paper.sheet, borderColor: paper.edge, color: paper.ink, fontFamily: family }}
    >
      <span className="leading-none" style={{ fontSize: Math.min(size * 2.5, 56) }}>
        Aa
      </span>
      <span className="line-clamp-2" style={{ fontSize: Math.min(size, 30), lineHeight: 1.45 }}>
        Invite your team and ship the first release together.
      </span>
      {token.kind === "font" && (
        <span className="text-[13px]" style={{ color: paper.muted }}>
          0123456789 &amp; ?! @ #
        </span>
      )}
    </div>
  )
}

/** The whole z-index scale as a stack, top layer first, with this one marked. */
function LayerStack({ token }: { token: SampleToken }) {
  const scale = zIndexes.filter((other) => other.library === token.library)
  return (
    <div className="flex flex-col gap-px rounded-md border bg-muted/40 p-2">
      {scale.map((other, index) => (
        <div
          key={other.name}
          className={`flex h-5 items-center gap-2 rounded-[3px] px-2 text-[11px] ${
            other === token ? "bg-(--canvas-layer) text-white" : "text-muted-foreground"
          }`}
          style={{ marginLeft: (scale.length - 1 - index) * 4 }}
        >
          <span className="flex-1 truncate">{other.name.replace("chakra-z-index-", "")}</span>
          <span className="tabular-nums">{other.values.default}</span>
        </div>
      ))}
    </div>
  )
}

/** The breakpoints on one ruler, with the phone, tablet and laptop widths designs use for scale. */
function BreakpointRuler({ token, width }: { token: SampleToken; width: number }) {
  const widest = 1536
  const at = (value: number) => (value / widest) * (width - 24)
  return (
    <div className="relative h-24 rounded-md border bg-muted/40 px-3">
      <div className="absolute inset-x-3 top-12 h-px bg-muted-foreground/40" />
      {[
        { name: "Phone", width: 390 },
        { name: "Tablet", width: 768 },
        { name: "Laptop", width: 1280 }
      ].map((device) => (
        <span
          key={device.name}
          className="absolute top-14 text-[10px] text-muted-foreground/70"
          style={{ left: 12 + at(device.width) - 14 }}
        >
          {device.name}
        </span>
      ))}
      {breakpoints.map((other) => {
        const left = 12 + at(px(drawn(other)))
        const mine = other === token
        return (
          <span key={other.name} className="absolute top-4 flex flex-col items-center" style={{ left: left - 12 }}>
            <span className={`text-[10px] ${mine ? "text-foreground" : "text-muted-foreground"}`}>
              {other.name.replace("breakpoint-", "")}
            </span>
            <span
              className="mt-0.5 h-4 w-[2px] rounded-full"
              style={{ background: mine ? "var(--canvas-mode)" : "var(--muted-foreground)" }}
            />
          </span>
        )
      })}
      <span className="absolute right-3 bottom-2 text-[10px] text-muted-foreground tabular-nums">
        {px(drawn(token))}px and wider
      </span>
    </div>
  )
}

/** The small preview in a picker's button, beside the token's name. */
function TriggerGlyph({ token }: { token: SampleToken }) {
  if (token.kind === "color") {
    return <span className="size-3.5 shrink-0 rounded-sm border border-white/15" style={{ background: drawn(token) }} />
  }
  return (
    <span
      className="relative h-4 w-6 shrink-0 overflow-hidden rounded-[3px] bg-white/5"
      style={onPaper.has(token.kind) ? { background: paper.sheet } : undefined}
    >
      <TokenArt token={token} width={24} height={16} />
    </span>
  )
}

/**
 * The inspector's token picker with previews: each option shows its kind's preview, motion plays on the highlighted
 * option, and a larger preview of the highlighted option sits under the list for the kinds a small one can't show.
 */
export function TokenPicker({
  kinds,
  value: initial,
  defaultOpen,
  label
}: {
  kinds: PreviewKind[]
  value?: string
  defaultOpen?: boolean
  label: string
}) {
  const [value, setValue] = useState(initial)
  const [open, setOpen] = useState(defaultOpen ?? false)
  const choices = allTokens.filter((token) => kinds.includes(token.kind) && !token.name.startsWith("color-"))
  const [active, setActive] = useState(value ?? choices[0]?.name ?? "")
  const current = choices.find((token) => token.name === value)
  const highlighted = choices.find((token) => token.name === active)
  const reduced = useReducedMotion()
  const groups = Map.groupBy(choices, (token) => token.source)
  // A list row is enough for a color or a length; shadows, blur and motion want a closer look.
  const footer = highlighted && !["color", "spacing", "font-weight", "z-index"].includes(highlighted.kind)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-full justify-between gap-1.5 px-2 text-xs font-normal">
          <span className="flex min-w-0 items-center gap-1.5">
            {current && <TriggerGlyph token={current} />}
            <span className={`truncate font-mono ${current ? "" : "text-muted-foreground"}`}>{value ?? "None"}</span>
          </span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="left" sideOffset={8}>
        <Command value={active} onValueChange={setActive}>
          <CommandInput placeholder={`Search ${label.toLowerCase()} tokens`} className="h-8 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty>No token matches.</CommandEmpty>
            {[...groups].map(([source, list]) => (
              <CommandGroup key={source} heading={source === "semantic" ? "Project tokens" : "Theme scale"}>
                {list.map((token) => (
                  <CommandItem
                    key={token.name}
                    value={token.name}
                    onSelect={() => {
                      setValue(token.name)
                      setOpen(false)
                    }}
                    className="gap-2 text-xs"
                  >
                    <TokenGlyph
                      token={token}
                      playing={moving.has(token.kind) && !reduced && token.name === active}
                      themes={token.kind === "color" ? themesOf(token) : undefined}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
                    <span className="max-w-16 truncate text-muted-foreground tabular-nums">{valueLabel(token)}</span>
                    {token.name === value && <Check className="size-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          {footer && (
            <div className="flex items-center gap-3 border-t p-2">
              <TokenTile
                token={highlighted}
                width={120}
                height={64}
                playing={moving.has(highlighted.kind) && !reduced}
              />
              <div className="min-w-0 flex-1 text-[11px]">
                <div className="truncate font-mono">{highlighted.name}</div>
                <div className="line-clamp-3 break-all text-muted-foreground">{drawn(highlighted)}</div>
              </div>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** The inspector's right panel, as far as its token fields go, with whichever picker the story opens. */
export function InspectorPickers({ open }: { open?: string }) {
  const picker = (label: string, kinds: PreviewKind[], value?: string, hint?: string): ReactNode => (
    <Field label={label} hint={hint}>
      <TokenPicker label={label} kinds={kinds} value={value} defaultOpen={open === label} />
    </Field>
  )
  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex h-12 items-center gap-2 border-b px-4 text-sm">
        <span className="size-2 rounded-full" style={{ background: "var(--canvas-component)" }} />
        <span className="font-medium">Plan card</span>
        <span className="text-muted-foreground">Card</span>
      </div>
      <PanelSection title="Appearance">
        <div className="flex flex-col gap-1">
          {picker("Fill", ["color"], "card")}
          {picker("Radius", ["radius"], "radius-xl")}
          {picker("Border", ["border-width", "border"], "strokeWidthThin")}
          {picker("Shadow", ["shadow", "inset-shadow"], "shadow-md")}
          {picker("Opacity", ["opacity"], undefined, "A token, or type a percent")}
          {picker("Blur", ["blur"], undefined, "CAN-72 adds it")}
          {picker("Backdrop", ["backdrop-blur"], undefined, "CAN-72 adds it")}
        </div>
      </PanelSection>
      <PanelSection title="Text">
        <div className="flex flex-col gap-1">
          {picker("Font", ["font"], "font-heading")}
          {picker("Size", ["font-size"], "text-2xl")}
          {picker("Weight", ["font-weight"], "font-weight-semibold")}
          {picker("Line height", ["leading"], "leading-snug")}
          {picker("Letter spacing", ["tracking"], "tracking-tight")}
          {picker("Text shadow", ["text-shadow"])}
        </div>
      </PanelSection>
      <PanelSection title="Motion" description="If Parity edits transitions, its pickers preview the same way.">
        <div className="flex flex-col gap-1">
          {picker("Duration", ["duration"], "durationNormal")}
          {picker("Easing", ["easing"], "ease-out")}
        </div>
      </PanelSection>
    </aside>
  )
}

/** Every kind once, as a row, a tile and where Parity files it today. */
export function KindGallery() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,250px)] gap-3">
      {exemplars.map((name) => (
        <KindCard key={name} token={tokenNamed(name)} />
      ))}
    </div>
  )
}

/** One token of each kind, chosen to show its kind well: a mid-sized shadow, a color that differs by theme. */
const exemplars = [
  "primary",
  "font-sans",
  "text-2xl",
  "font-weight-semibold",
  "leading-relaxed",
  "tracking-widest",
  "spacing-6",
  "radius-xl",
  "strokeWidthThicker",
  "chakra-borders-md",
  "shadow-lg",
  "inset-shadow-sm",
  "drop-shadow-2xl",
  "text-shadow-lg",
  "opacity-scrim",
  "blur-md",
  "backdrop-blur-sm",
  "perspective-normal",
  "aspect-video",
  "durationNormal",
  "ease-spring",
  "animate-bounce",
  "chakra-z-index-modal",
  "breakpoint-md",
  "container-2xl",
  "chakra-cursor-button",
  "mantine-scale"
]

/** Where the panel puts a kind today when that's a catch-all rather than a section of its own. */
const catchAll: Partial<Record<string, string>> = { other: "Under Other today", effect: "Under Effects today" }

function KindCard({ token }: { token: SampleToken }) {
  const { playing, handlers } = useHoverPlay(token)
  const today = catchAll[token.category]
  const section = tokenSections.find((entry) => entry.kinds.some((kind) => kind.kind === token.kind))
  const heading = section?.kinds.find((kind) => kind.kind === token.kind)?.heading
  return (
    <div {...handlers} className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">
          {section?.title}
          {heading && section!.kinds.length > 1 && (
            <span className="text-muted-foreground"> {heading.toLowerCase()}</span>
          )}
        </span>
        {today && <span className="text-[10px] text-(--process-starting)">{today}</span>}
      </div>
      <TokenTile token={token} width={224} height={84} playing={playing} />
      <div className="flex items-center gap-2 text-xs">
        <TokenGlyph token={token} playing={playing} themes={token.kind === "color" ? themesOf(token) : undefined} />
        <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{valueLabel(token)}</span>
      </div>
    </div>
  )
}
