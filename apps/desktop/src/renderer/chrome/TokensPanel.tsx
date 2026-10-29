import type { DescribedToken, DescribedTokens, Token, TokenCategory } from "@parity/core"
import { Search } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { TokenChange } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { resolveTokenValue, spacingUnit, useTokenFailure, useTokenList } from "../tokens-store.ts"
import { save } from "./commands.ts"
import { Swatch } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { PanelError } from "./PanelError.tsx"
import { PanelSection } from "./PanelSection.tsx"

const sections: { title: string; categories: TokenCategory[] }[] = [
  { title: "Colors", categories: ["color"] },
  { title: "Font sizes", categories: ["font-size"] },
  { title: "Fonts", categories: ["font"] },
  { title: "Font weights", categories: ["font-weight"] },
  { title: "Letter spacing", categories: ["tracking"] },
  { title: "Line height", categories: ["leading"] },
  { title: "Spacing", categories: ["spacing"] },
  { title: "Radius", categories: ["radius"] },
  { title: "Shadows", categories: ["shadow"] },
  { title: "Breakpoints", categories: ["breakpoint"] },
  { title: "Containers", categories: ["container"] },
  { title: "Effects", categories: ["effect"] },
  { title: "Motion", categories: ["motion"] },
  { title: "Other", categories: ["other"] }
]

type Source = "all" | "semantic" | "theme"

/** A token a `.lib.par` describes, with the library that describes it. */
type Described = DescribedToken & { library: string }

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
 * Every token a design may use: the project's own (semantic) variables and its styling framework's full theme. Any
 * value can be edited; the change shows in every frame immediately and is written to the project's stylesheet.
 */
export function TokensPanel() {
  const session = useProject()
  const { tokens: store, info } = session
  const tokens = useTokenList(store)
  const failure = useTokenFailure(store)
  const unwritten = new Set(failure?.tokens.map((change) => change.name))
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<Source>("all")
  const needle = query.trim().toLowerCase()
  const matches = tokens.filter(
    (token) => (source === "all" || token.source === source) && (!needle || token.name.includes(needle))
  )
  const themes = [...new Set(tokens.flatMap((token) => Object.keys(token.values)))]
  const counts = { semantic: tokens.filter((t) => t.source === "semantic").length, theme: 0 }
  counts.theme = tokens.length - counts.semantic
  const described = matchDescribed(info.describedTokens, tokens)
  const unmatched = described.unmatched.filter((token) => !needle || token.path.toLowerCase().includes(needle))

  return (
    <>
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="relative">
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
      {sections.map(({ title, categories }) => {
        const list = matches.filter((token) => categories.includes(token.category))
        if (list.length === 0) return null
        if (categories.includes("color")) {
          const semantic = list.filter((token) => token.source === "semantic")
          const palette = list.filter((token) => token.source === "theme")
          return (
            <div key={title}>
              {semantic.length > 0 && (
                <PanelSection title="Project colors" count={semantic.length}>
                  <ul className="flex flex-col">
                    {semantic.map((token) => (
                      <TokenRow
                        key={token.name}
                        token={token}
                        tokens={tokens}
                        themes={themes}
                        described={described.byName.get(token.name)}
                        unwritten={unwritten.has(token.name)}
                      />
                    ))}
                  </ul>
                </PanelSection>
              )}
              {palette.length > 0 && (
                <PanelSection title="Palette" count={palette.length}>
                  <Palette tokens={palette} all={tokens} themes={themes} unwritten={unwritten} />
                </PanelSection>
              )}
            </div>
          )
        }
        return (
          <PanelSection key={title} title={title} count={list.length}>
            <ul className="flex flex-col">
              {list.map((token) => (
                <TokenRow
                  key={token.name}
                  token={token}
                  tokens={tokens}
                  themes={themes}
                  described={described.byName.get(token.name)}
                  unwritten={unwritten.has(token.name)}
                />
              ))}
            </ul>
          </PanelSection>
        )
      })}
      {source === "all" && unmatched.length > 0 && (
        <PanelSection title="Described only" count={unmatched.length}>
          <p className="-mt-1 mb-2 px-1 text-xs text-muted-foreground">
            A .lib.par describes these, but no custom property in the stylesheet matches them, so frames can&apos;t use
            them.
          </p>
          <ul className="flex flex-col">
            {unmatched.map((token) => (
              <DescribedRow key={`${token.library}:${token.path}`} token={token} />
            ))}
          </ul>
        </PanelSection>
      )}
      {matches.length === 0 && unmatched.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">No tokens match.</p>
      )}
    </>
  )
}

function TokenRow({
  token,
  tokens,
  themes,
  described,
  unwritten = false
}: {
  token: Token
  tokens: Token[]
  themes: string[]
  /** What a `.lib.par` says about this token. */
  described?: Described
  /** Whether the last save couldn't write its value to the stylesheet. */
  unwritten?: boolean
}) {
  return (
    <li>
      <TokenEditor token={token} tokens={tokens} themes={themes}>
        <Hint label={described?.description ? `${described.description} (${described.library})` : undefined} wait>
          <button
            type="button"
            className="flex min-h-7 w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent/50"
          >
            <TokenPreview token={token} tokens={tokens} themes={themes} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono">{token.name}</span>
              {described?.description && (
                <span className="truncate text-[11px] text-muted-foreground">{described.description}</span>
              )}
              {unwritten && <span className="text-[11px] text-destructive">Not written to the stylesheet</span>}
            </span>
            {token.category === "spacing" ? (
              <Hint label={token.values.default} wait>
                <span className="text-muted-foreground tabular-nums">{spacingPx(token, tokens)}</span>
              </Hint>
            ) : (
              token.category !== "color" && (
                <Hint label={token.values.default} wait>
                  <span className="max-w-28 truncate text-muted-foreground">{token.values.default}</span>
                </Hint>
              )
            )}
          </button>
        </Hint>
      </TokenEditor>
    </li>
  )
}

/** A token a `.lib.par` describes but the stylesheet doesn't have, with its value in each context. */
function DescribedRow({ token }: { token: Described }) {
  const contexts = Object.entries(token.values)
  return (
    <li className="flex min-h-7 min-w-0 items-center gap-2 px-1.5 py-1 text-xs">
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
    </li>
  )
}

/** Tailwind's palette as a grid: one row per hue, its shades across. */
function Palette({
  tokens,
  all,
  themes,
  unwritten
}: {
  tokens: Token[]
  all: Token[]
  themes: string[]
  /** Tokens whose values the last save couldn't write. */
  unwritten: ReadonlySet<string>
}) {
  const hues = Map.groupBy(tokens, (token) => /^color-([a-z]+)-\d+$/.exec(token.name)?.[1] ?? "")
  const loose = hues.get("") ?? []
  hues.delete("")
  return (
    <div className="flex flex-col gap-1">
      {[...hues].map(([hue, shades]) => (
        <div key={hue} className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 truncate text-[11px] text-muted-foreground">{hue}</span>
          <div className="flex flex-1 gap-px overflow-hidden rounded-sm">
            {shades.map((token) => (
              <TokenEditor key={token.name} token={token} tokens={all} themes={themes}>
                <Hint
                  label={`${token.name}: ${token.values.default}${unwritten.has(token.name) ? ", not written to the stylesheet" : ""}`}
                >
                  <button
                    type="button"
                    aria-label={token.name}
                    className={`h-5 flex-1 hover:outline-2 hover:outline-offset-1 hover:outline-foreground ${
                      unwritten.has(token.name) ? "outline-2 -outline-offset-2 outline-destructive" : ""
                    }`}
                    style={{ background: resolveTokenValue(all, token.name) }}
                  />
                </Hint>
              </TokenEditor>
            ))}
          </div>
        </div>
      ))}
      {loose.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {loose.map((token) => (
            <TokenRow
              key={token.name}
              token={token}
              tokens={all}
              themes={themes}
              unwritten={unwritten.has(token.name)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TokenPreview({ token, tokens, themes }: { token: Token; tokens: Token[]; themes: string[] }) {
  if (token.category === "color") {
    const shown = token.source === "semantic" ? themes : ["default"]
    return (
      <span className="flex shrink-0">
        {shown.map((theme) => (
          <Hint
            key={theme}
            label={`${theme === "default" ? "Light" : theme}: ${resolveTokenValue(tokens, token.name, theme)}`}
            wait
          >
            <span
              className="size-4 border border-white/15 first:rounded-l-sm last:rounded-r-sm"
              style={{ background: resolveTokenValue(tokens, token.name, theme) }}
            />
          </Hint>
        ))}
      </span>
    )
  }
  if (token.category === "radius") {
    return (
      <span
        className="size-4 shrink-0 border-t-2 border-l-2 border-muted-foreground"
        style={{ borderTopLeftRadius: resolveTokenValue(tokens, token.name) }}
      />
    )
  }
  if (token.category === "shadow") {
    return <span className="size-4 shrink-0 rounded-sm bg-card" style={{ boxShadow: token.values.default }} />
  }
  if (token.category === "font-size") {
    return <span className="w-4 shrink-0 text-center text-[11px] text-muted-foreground">Aa</span>
  }
  if (token.category === "spacing" && token.derived) {
    const width = Math.min(48, token.derived.factor * spacingUnit(tokens))
    return (
      <span className="flex w-12 shrink-0 items-center">
        <span
          className="h-2.5 rounded-[2px]"
          style={{ width: Math.max(1, width), background: "var(--canvas-layer)" }}
        />
      </span>
    )
  }
  return <span className="w-4 shrink-0" />
}

/** The CSS property each kind of token is checked against, and what its values are called. */
const valueKinds: Partial<Record<TokenCategory, [property: string, noun: string]>> = {
  color: ["color", "color"],
  spacing: ["margin", "length"],
  radius: ["border-radius", "radius"],
  "font-size": ["font-size", "font size"],
  font: ["font-family", "font family"],
  "font-weight": ["font-weight", "font weight"],
  tracking: ["letter-spacing", "letter spacing"],
  leading: ["line-height", "line height"],
  shadow: ["box-shadow", "shadow"],
  breakpoint: ["width", "length"],
  container: ["width", "length"]
}

/** Whether a value suits its token's kind. A reference to another token always does. */
function validTokenValue(category: TokenCategory, value: string): boolean {
  if (/^var\(--[\w-]+(\s*,.*)?\)$/s.test(value)) return true
  const kind = valueKinds[category]
  return kind ? CSS.supports(kind[0], value) : CSS.supports(`--probe: ${value}`)
}

/** Edits one token's value in each theme it has. */
function TokenEditor({
  token,
  tokens,
  themes,
  children
}: {
  token: Token
  tokens: Token[]
  themes: string[]
  children: React.ReactElement
}) {
  const { tokens: store } = useProject()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const editable = token.source === "semantic" ? themes : ["default"]

  if (token.derived) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-72" align="start" side="right">
          <div className="font-mono text-sm font-medium">{token.name}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {token.derived.factor} steps of <code>--{token.derived.from}</code>, {spacingPx(token, tokens)}. It follows
            the scale: change <code>--{token.derived.from}</code> to resize every step.
          </p>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            const invalid = changes.find((change) => !validTokenValue(token.category, change.value))
            if (invalid) {
              setError(`"${invalid.value}" isn't a valid ${valueKinds[token.category]?.[1] ?? "CSS value"}`)
              return
            }
            setError(undefined)
            store.set(changes)
            setOpen(false)
          }}
        >
          <div>
            <div className="font-mono text-sm font-medium">--{token.name}</div>
            <div className="text-xs text-muted-foreground">
              {token.source === "semantic" ? "Project token" : "Theme scale"} with {token.category.replace("-", " ")}{" "}
              values
            </div>
          </div>
          {editable.map((theme) => (
            <label key={theme} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {theme === "default" ? "Light (root)" : `Theme .${theme}`}
              </span>
              <span className="flex items-center gap-2">
                {token.category === "color" && (
                  <Swatch value={resolveTokenValue(tokens, token.name, theme)} className="size-7" />
                )}
                <Input name={theme} defaultValue={token.values[theme] ?? ""} className="h-8 font-mono text-xs" />
              </span>
            </label>
          ))}
          {error && <p className="text-xs text-destructive">{error}</p>}
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

/** A spacing token's size in pixels: a step of the scale by its factor, the base and other lengths by their value. */
function spacingPx(token: Token, tokens: Token[]): string {
  const unit = spacingUnit(tokens)
  if (token.derived) return `${formatNumber(token.derived.factor * unit)}px`
  const match = /^([\d.]+)(rem|px)$/.exec(token.values.default?.trim() ?? "")
  return match ? `${formatNumber(Number(match[1]) * (match[2] === "rem" ? 16 : 1))}px` : (token.values.default ?? "")
}

/** The tokens a save couldn't write, by name: one, or how many. */
function failedNames(changes: readonly TokenChange[]): string {
  const names = [...new Set(changes.map((change) => change.name))]
  return names.length === 1 ? `--${names[0]}` : `${names.length} tokens`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
