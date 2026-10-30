// A token's detail, opened from its row in the Tokens panel: a large preview, the facts about it, and Edit and Copy.
// docs/proposals/previews.md has the design; docs/editor.md says how it behaves.

import { codeForms, substituteReferences, tokenReferences, valueParts } from "@parity/core"
import { Check, ChevronDown, Pause, Pencil, Play } from "lucide-react"
import { Fragment, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { CopyButton, useCopy } from "./Copy.tsx"
import { Swatch } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import {
  AnimationArt,
  drawn,
  DurationArt,
  EasingArt,
  moving,
  ms,
  paper,
  type PreviewToken,
  px,
  rest,
  SpacingBar,
  TokenArt,
  TokenTile,
  useReducedMotion,
  valueLabel,
  valueProblem
} from "./token-previews.tsx"

/** A token as its detail shows it. */
export interface DetailToken {
  /** As its preview draws it: what it comes to in each theme it has. */
  preview: PreviewToken
  /** Its value in each of those themes, as written. */
  values: Record<string, string>
  /** What a `.lib.par` says it's for, and which library says so. */
  description?: string
  library?: string
  /** A step of a scale, which follows the scale's base rather than holding a value of its own. */
  derived?: { from: string; factor: number }
  /** Whether the last save couldn't write it to the stylesheet. */
  unwritten?: boolean
}

/**
 * A token's detail. A large preview; the name, with what it comes to on the right as its row shows it, and what it's
 * for; one list of facts (its value in each theme, the tokens it's built on, where it's from); and a bar with the two
 * things to do with it, Edit and Copy. Edit turns the values into fields in place, checked as they're typed, and the bar
 * into Cancel and Apply. Apply changes every frame at once, unsaved, as any edit is; the detail then says that saving
 * the project writes it, with Undo while it's still the last change. Motion plays while the detail is open, with a
 * button on the preview to stop it; with reduced motion it waits for Play.
 */
export function TokenDetail({
  token,
  themeNames,
  scale,
  stylesheet,
  classes,
  lookup,
  onApply,
  undo,
  draft
}: {
  token: DetailToken
  /** Each theme's name, as the Modes panel gives it, by the key the token's values use. */
  themeNames: ReadonlyMap<string, string>
  /** The tokens of its kind, for the previews that draw it among the rest of its scale. */
  scale: readonly PreviewToken[]
  /** Where saving the project writes it. */
  stylesheet: string
  /** Whether the project styles with Tailwind, so Copy as offers the classes that use the token. */
  classes: boolean
  /** What another token comes to in a theme, or undefined when there's no token of that name. */
  lookup(name: string, theme: string): string | undefined
  /** Changes its values, as one undoable step. */
  onApply(values: Record<string, string>): void
  /** Takes back the last apply, while it's still the history's last step. */
  undo?: () => void
  /** Opens it already editing, with these values typed, for a story. */
  draft?: Record<string, string>
}) {
  const id = useId()
  const reduced = useReducedMotion()
  const [play, setPlay] = useState<boolean>()
  const [drafts, setDrafts] = useState(draft)
  const [applied, setApplied] = useState(false)
  const { preview, values } = token
  const kind = preview.kind
  const themes = Object.keys(values)
  const editing = drafts !== undefined
  const problems: Record<string, string | undefined> = Object.fromEntries(
    themes.map((theme) => [
      theme,
      drafts ? valueProblem(kind, drafts[theme] ?? "", (name) => lookup(name, theme)) : undefined
    ])
  )
  const valid = themes.every((theme) => !problems[theme])
  const changes = drafts
    ? Object.fromEntries(
        themes.flatMap((theme) => {
          const value = (drafts[theme] ?? "").trim()
          return value !== values[theme] ? [[theme, value]] : []
        })
      )
    : {}
  const changed = Object.keys(changes).length > 0
  // While editing, the preview follows what's typed, as long as it's a value it can draw.
  const shown: PreviewToken =
    drafts && valid && changed
      ? {
          ...preview,
          values: Object.fromEntries(
            themes.map((theme) => [
              theme,
              substituteReferences((drafts[theme] ?? "").trim(), (name) => lookup(name, theme))
            ])
          )
        }
      : preview
  // What it comes to, by the name, as its row shows it; left out where the value already says just that.
  const label = valueLabel(shown)
  const comesTo = label === values.default ? undefined : label
  const playing = moving.has(kind) && (play ?? !reduced)
  const built = token.derived ? [token.derived.from] : tokenReferences(values.default ?? "")
  const cancel = () => setDrafts(undefined)
  return (
    <div className="flex flex-col">
      <div className="group/preview relative px-3 pt-3">
        <DetailPreview token={shown} scale={scale} playing={playing} themeNames={themeNames} />
        {moving.has(kind) && (
          <Hint label={playing ? "Pause" : "Play"}>
            {/* As on a video: always there while paused, and while playing only when the pointer or keyboard is on the
                preview, so it doesn't sit over the motion. */}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => setPlay(!playing)}
              className={`absolute right-5 bottom-2 rounded-full bg-popover shadow-sm transition-opacity focus-visible:opacity-100 ${playing ? "opacity-0 group-hover/preview:opacity-100" : ""}`}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
          </Hint>
        )}
      </div>
      <header className="flex flex-col gap-0.5 p-3">
        <div className="flex items-baseline gap-3">
          <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-medium">--{preview.name}</h3>
          {comesTo && <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">{comesTo}</span>}
        </div>
        {token.description && <p className="text-xs text-muted-foreground">{token.description}</p>}
      </header>
      <form
        data-token-editing={editing || undefined}
        onSubmit={(event) => {
          event.preventDefault()
          if (!changed || !valid) return
          onApply(changes)
          setDrafts(undefined)
          setApplied(true)
        }}
      >
        <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 border-t px-3 py-3 text-xs">
          {themes.map((theme, index) => (
            <Fragment key={theme}>
              <dt className="text-muted-foreground">
                <label htmlFor={`${id}-${theme}`}>{themeLabel(theme, themes, themeNames)}</label>
              </dt>
              <dd className="min-w-0">
                {editing ? (
                  <>
                    <span className="flex items-center gap-2">
                      {kind === "color" && (
                        <Swatch
                          value={problems[theme] ? "transparent" : drawn(shown, theme)}
                          className="size-5 shrink-0"
                        />
                      )}
                      <Input
                        id={`${id}-${theme}`}
                        name={theme}
                        value={drafts[theme] ?? ""}
                        // The fields open because Edit was pressed, so the first takes the keyboard.
                        // oxlint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus={index === 0}
                        aria-invalid={problems[theme] ? true : undefined}
                        onChange={(event) => setDrafts({ ...drafts, [theme]: event.currentTarget.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") cancel()
                        }}
                        className="h-7 font-mono text-xs"
                      />
                    </span>
                    {problems[theme] && <p className="mt-1 text-[11px] text-destructive">{problems[theme]}</p>}
                  </>
                ) : (
                  <span id={`${id}-${theme}`} className="flex items-baseline gap-2">
                    {kind === "color" && (
                      <Swatch value={drawn(preview, theme)} className="size-3 shrink-0 translate-y-0.5" />
                    )}
                    <ValueText value={values[theme] ?? ""} />
                  </span>
                )}
              </dd>
            </Fragment>
          ))}
          {!editing && token.unwritten && (
            <dd className="col-start-2 -mt-1 text-[11px] text-destructive">Not written to the stylesheet</dd>
          )}
          {!editing && applied && !token.unwritten && (
            <dd className="col-start-2 -mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              <Check className="size-3 shrink-0 text-(--process-running)" />
              Applied. Saving writes it to {stylesheet}.
              {undo && (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-0 text-[11px]"
                  onClick={() => {
                    undo()
                    setApplied(false)
                  }}
                >
                  Undo
                </Button>
              )}
            </dd>
          )}
          {built.length > 0 && (
            <>
              <dt className="text-muted-foreground">Built on</dt>
              <dd className="flex min-w-0 flex-col gap-1">
                {built.map((name) => (
                  <span key={name} className="flex min-w-0 items-baseline gap-2">
                    <code className="shrink-0 font-mono whitespace-nowrap">
                      --{name}
                      {token.derived && ` × ${token.derived.factor}`}
                    </code>
                    <code className="truncate font-mono text-muted-foreground">{lookup(name, "default")}</code>
                  </span>
                ))}
              </dd>
            </>
          )}
          {token.library && (
            <>
              <dt className="text-muted-foreground">From</dt>
              <dd>{token.library}</dd>
            </>
          )}
        </dl>
        <footer className="flex min-h-11 items-center gap-2 border-t px-3 py-2">
          {editing ? (
            <>
              <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                {!valid ? "Fix the value to apply" : changed ? "Every frame shows it at once" : "Nothing to apply yet"}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!changed || !valid}>
                Apply
              </Button>
            </>
          ) : (
            <>
              <Hint
                label={
                  token.derived ? `It follows --${token.derived.from}: change that to resize every step` : undefined
                }
              >
                {/* A disabled button takes no pointer, so its hint is on a wrapper. */}
                <span className="-ml-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={Boolean(token.derived)}
                    onClick={() => {
                      setDrafts(values)
                      setApplied(false)
                    }}
                  >
                    <Pencil /> Edit
                  </Button>
                </span>
              </Hint>
              <span className="flex-1" />
              <CopyMenu token={preview} classes={classes} />
            </>
          )}
        </footer>
      </form>
    </div>
  )
}

/**
 * Escape in a field being edited leaves editing, which the field handles, rather than closing the detail. From the
 * buttons, Escape closes the detail, which changes nothing either. Give it to the popover's `onEscapeKeyDown`.
 */
export function keepEditing(event: KeyboardEvent): void {
  if (event.target instanceof Element && event.target.matches("[data-token-editing] input")) event.preventDefault()
}

/**
 * A theme's name as people say it, as the Modes panel names it: Light and Dark, or a library's own (Teams high
 * contrast), never the class that switches it on. A token with one value has no theme to name, so its row is Value.
 */
export function themeLabel(theme: string, themes: readonly string[], names: ReadonlyMap<string, string>): string {
  if (themes.length === 1) return "Value"
  const named = names.get(theme)
  if (named) return named
  if (theme === "default") return "Default"
  const words = theme.replaceAll(/[-_]+/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The detail's copy control, a split button. Its main half copies the name, as rows do; its arrow opens the other ways
 * to write the token, in CSS and, in a Tailwind project, as classes, each saying what it sets. Whichever is copied, the main half's check says
 * so, and its tooltip names what was copied.
 */
function CopyMenu({ token, classes }: { token: PreviewToken; classes: boolean }) {
  const copying = useCopy()
  const forms = codeForms(token.name, token.kind, drawn(token)).filter((form) => classes || form.group === "CSS")
  const groups = Map.groupBy(forms, (form) => form.group)
  return (
    <div className="flex items-center rounded-lg border bg-background shadow-xs dark:border-input dark:bg-input/30">
      <CopyButton text={`--${token.name}`} copying={copying} className="rounded-r-none">
        Copy
      </CopyButton>
      <span aria-hidden className="h-4 w-px bg-border" />
      <DropdownMenu>
        <Hint label="Copy as">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Copy as" className="w-6 rounded-l-none">
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-72">
          {[...groups].map(([group, forms], index) => (
            <DropdownMenuGroup key={group}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{group}</DropdownMenuLabel>
              {forms.map((form) => (
                <DropdownMenuItem key={form.text} onSelect={() => copying.copy(form.text)} className="gap-3 text-xs">
                  <span className="shrink-0">{form.label}</span>
                  <code className="ml-auto min-w-0 truncate font-mono text-muted-foreground">{form.text}</code>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * A value in code type. A list, such as a shadow's layers or a font stack, goes one part to a line, so it breaks where
 * it means to rather than in the middle of a number.
 */
function ValueText({ value }: { value: string }) {
  const parts = valueParts(value)
  return (
    <code className="flex min-w-0 flex-col font-mono wrap-anywhere">
      {parts.map((part, index) => (
        // A part too long for its line goes on indented, so it never looks like the next part.
        <span key={`${index}:${part}`} className="pl-3 -indent-3">
          {part}
          {index < parts.length - 1 && ","}
        </span>
      ))}
    </code>
  )
}

/** The detail's large preview: the tile for most kinds, and for a few, the token among the rest of its scale. */
export function DetailPreview({
  token,
  scale,
  playing,
  themeNames
}: {
  token: PreviewToken
  scale: readonly PreviewToken[]
  playing: boolean
  themeNames: ReadonlyMap<string, string>
}) {
  const width = 296
  const others = scale.filter((other) => other.name !== token.name)
  switch (token.kind) {
    case "color": {
      const themes = Object.keys(token.values)
      return (
        <div className="flex h-24 overflow-hidden rounded-md border border-white/10">
          {themes.map((theme) => (
            <div key={theme} className="relative flex-1">
              <TokenArt token={token} width={width / themes.length} height={96} theme={theme} />
              {themes.length > 1 && (
                <span
                  className="absolute bottom-1.5 left-2 rounded px-1 text-[10px]"
                  style={{ background: "rgb(0 0 0 / 0.55)", color: "white" }}
                >
                  {themeLabel(theme, themes, themeNames)}
                </span>
              )}
            </div>
          ))}
        </div>
      )
    }
    case "spacing":
      return <SpacingScale token={token} scale={scale} width={width} />
    case "duration":
      return <DurationRace token={token} scale={scale} playing={playing} width={width} />
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
            ghosts={others.map((other) => drawn(other))}
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
      return <LayerStack token={token} scale={scale} />
    case "breakpoint":
      return <BreakpointRuler token={token} scale={scale} width={width} />
    default:
      return <TokenTile token={token} width={width} height={120} playing={playing} />
  }
}

/** Up to nine of a scale's steps around this one, in order, so a long scale doesn't push the facts off the screen. */
function around(token: PreviewToken, scale: readonly PreviewToken[]): PreviewToken[] {
  const at = scale.findIndex((step) => step.name === token.name)
  if (at < 0) return [token]
  const start = Math.max(0, Math.min(at - 4, scale.length - 9))
  return scale.slice(start, start + 9).map((step) => (step.name === token.name ? token : step))
}

/**
 * Steps of the spacing scale at their true size, as the rows draw them, with this one marked, so its length reads
 * against the rest. While editing, its bar follows what's typed.
 */
function SpacingScale({ token, scale, width }: { token: PreviewToken; scale: readonly PreviewToken[]; width: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/40 px-3 py-2">
      {around(token, scale).map((step) => {
        const current = step.name === token.name
        return (
          <div key={step.name} className="flex h-4 items-center gap-2">
            <span
              className={`w-24 shrink-0 truncate font-mono text-[10px] ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {step.name}
            </span>
            <SpacingBar length={px(drawn(step))} room={width - 26 - 104} dim={!current} />
          </div>
        )
      })}
    </div>
  )
}

/** Each duration in the scale side by side, setting off together, so this one's speed reads against the others. */
function DurationRace({
  token,
  scale,
  playing,
  width
}: {
  token: PreviewToken
  scale: readonly PreviewToken[]
  playing: boolean
  width: number
}) {
  const race = around(token, scale)
  const period = Math.max(...race.map((other) => ms(drawn(other)) || 0)) + rest
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2">
      {race.map((other) => (
        <div
          key={other.name}
          className={`flex items-center gap-2 ${other.name === token.name ? "text-foreground" : "text-muted-foreground/60"}`}
        >
          <span className="w-10 shrink-0 text-right text-[10px] tabular-nums">{drawn(other)}</span>
          <DurationArt value={drawn(other)} width={width - 80} height={12} playing={playing} period={period} />
        </div>
      ))}
    </div>
  )
}

/** A font or size set in the project's type: a large sample and a line of text. */
function TypeSpecimen({ token, width }: { token: PreviewToken; width: number }) {
  const size = token.kind === "font-size" ? px(drawn(token)) || 15 : 15
  return (
    <div
      className="flex flex-col gap-2 overflow-hidden rounded-md border p-3"
      style={{
        width,
        background: paper.sheet,
        borderColor: paper.edge,
        color: paper.ink,
        fontFamily: token.kind === "font" ? drawn(token) : undefined
      }}
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

/** The z-index scale as a stack, top layer first, with this one marked. */
function LayerStack({ token, scale }: { token: PreviewToken; scale: readonly PreviewToken[] }) {
  const stack = around(token, scale).toSorted((a, b) => Number(drawn(b)) - Number(drawn(a)))
  // The names' shared start (`chakra-z-index-`) says nothing, so it's left off.
  const shared = commonStart(stack.map((layer) => layer.name))
  return (
    <div className="flex flex-col gap-px rounded-md border bg-muted/40 p-2">
      {stack.map((layer, index) => (
        <div
          key={layer.name}
          className={`flex h-5 items-center gap-2 rounded-[3px] px-2 text-[11px] ${
            layer.name === token.name ? "bg-(--canvas-layer) text-white" : "text-muted-foreground"
          }`}
          style={{ marginLeft: (stack.length - 1 - index) * 4 }}
        >
          <span className="flex-1 truncate">{layer.name.slice(shared.length) || layer.name}</span>
          <span className="tabular-nums">{drawn(layer)}</span>
        </div>
      ))}
    </div>
  )
}

/** The breakpoints on one ruler, with the phone, tablet and laptop widths designs use for scale. */
function BreakpointRuler({
  token,
  scale,
  width
}: {
  token: PreviewToken
  scale: readonly PreviewToken[]
  width: number
}) {
  const widest = 1536
  const at = (value: number) => (Math.min(value, widest) / widest) * (width - 24)
  const shared = commonStart(scale.map((step) => step.name))
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
      {(scale.some((step) => step.name === token.name) ? scale : [token]).map((step) => {
        const mine = step.name === token.name
        const shown = mine ? token : step
        return (
          <span
            key={step.name}
            className="absolute top-4 flex flex-col items-center"
            style={{ left: 12 + at(px(drawn(shown)) || 0) - 12 }}
          >
            <span className={`text-[10px] ${mine ? "text-foreground" : "text-muted-foreground"}`}>
              {step.name.slice(shared.length) || step.name}
            </span>
            <span
              className="mt-0.5 h-4 w-[2px] rounded-full"
              style={{ background: mine ? "var(--canvas-mode)" : "var(--muted-foreground)" }}
            />
          </span>
        )
      })}
      <span className="absolute right-3 bottom-2 text-[10px] text-muted-foreground tabular-nums">
        {valueLabel(token)} and wider
      </span>
    </div>
  )
}

/** What every name starts with, up to its last separator: `breakpoint-` for `breakpoint-sm` and `breakpoint-md`. */
function commonStart(names: readonly string[]): string {
  if (names.length < 2) return ""
  let shared = names[0]!
  for (const name of names) while (!name.startsWith(shared)) shared = shared.slice(0, -1)
  return shared.slice(0, Math.max(shared.lastIndexOf("-"), shared.lastIndexOf("_")) + 1)
}
