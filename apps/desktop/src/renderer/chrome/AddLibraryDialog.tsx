import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn"
import type { AdapterIcon } from "@parity-app/core"
import type { PreviewKind } from "@parity-app/tokens"
import { ArrowUpRight, Component, LoaderCircle, type LucideIcon, Palette, Ruler } from "lucide-react"
import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react"
import type { CatalogLibrary, LibraryLook, LibraryPreview, LibrarySetting } from "../../shared/protocol.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"
import { AppSelect } from "./AppSelect.tsx"
import {
  Keyframes,
  moving,
  type PreviewToken,
  TokenTile,
  tokenSections,
  useHoverPlay,
  valueLabel
} from "./token-previews.tsx"

/** A component library Parity has a registry file for, as the dialog offers it. */
export interface OfferedLibrary {
  id: string
  name: string
  description: string
  package: string
  version?: string
  /** Its logo, drawn as the extensions' are. */
  logo?: AdapterIcon
  links: NonNullable<CatalogLibrary["links"]>
  installed: boolean
  /** The icon set it comes with, offered alongside. */
  companion?: { id: string; name: string; installed: boolean }
  /** What it asks before it's added, as shadcn's theme and base. */
  settings?: LibrarySetting[]
  look?: LibraryLook
}

/**
 * What a library's registry file holds, as the dialog shows it, with the keyframes its animation tokens run, by name, as
 * the Web Animations API takes them, where they're known.
 */
export type ShownPreview = LibraryPreview & { keyframes?: { name: string; frames: Keyframe[] }[] }

/** The catalog's component libraries as the dialog offers them, each with the icon set offered alongside it. */
export function offeredLibraries(catalog: readonly CatalogLibrary[]): OfferedLibrary[] {
  return catalog.flatMap((library): OfferedLibrary[] => {
    if (library.kind !== "components") {
      return []
    }

    const set = library.companion ? catalog.find((candidate) => candidate.id === library.companion) : undefined

    return [
      {
        id: library.id,
        name: library.name,
        description: library.description,
        package: library.package,
        version: library.version,
        logo: library.logo,
        links: library.links ?? {},
        installed: library.installed,
        companion: set && { id: set.id, name: set.name, installed: set.installed },
        settings: library.settings,
        look: library.look
      }
    ]
  })
}

/** What adding a library takes: its settings when it asks for any, and its icon set when chosen with it. */
export interface LibraryChoice {
  library: string
  settings?: Record<string, string>
  companions: string[]
}

type Step = "browse" | "settings" | "remove"

/** The token sections the dialog draws, as the Tokens panel names them. Breakpoints have a list of their own. */
const shownSections = new Set([
  "Colors",
  "Text styles",
  "Fonts",
  "Font sizes",
  "Font weights",
  "Spacing",
  "Radius",
  "Shadows",
  "Motion"
])

/**
 * The project's component libraries, to add, change or remove: each library Parity has a prebuilt file for, drawn from
 * that file. Its look in its own tokens, in each of its themes; its tokens as the Tokens panel draws them; its
 * components by family; and its breakpoints. A library with an icon set of its own offers it alongside. One that asks
 * for settings, as shadcn does, takes them in a second step, and its look follows them.
 */
export function AddLibraryDialog({
  open,
  onOpenChange,
  libraries,
  loadPreview,
  initialLibrary,
  onAdd,
  onRemove
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  libraries: readonly OfferedLibrary[]
  /** What a library's file holds, with its settings when it has any. */
  loadPreview: (library: string, settings?: Record<string, string>) => Promise<ShownPreview | undefined>
  initialLibrary?: string
  onAdd: (choice: LibraryChoice) => void
  onRemove: (library: string) => void
}) {
  const [selected, setSelected] = useState(initialLibrary ?? libraries[0]?.id)
  // The first, until one is chosen, which may be only once the catalog has come.
  const library = libraries.find((candidate) => candidate.id === selected) ?? libraries[0]
  const previews = usePreviews(loadPreview)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="@container/dialog flex h-[min(760px,90vh)] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Component libraries</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Libraries" className="w-16 shrink-0 overflow-y-auto border-r p-2 @3xl/dialog:w-56">
            <ul className="flex flex-col gap-0.5">
              {libraries.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    aria-label={candidate.name}
                    aria-current={candidate.id === library?.id ? "true" : undefined}
                    onClick={() => setSelected(candidate.id)}
                    className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-sm hover:bg-accent/60 aria-[current]:bg-accent"
                  >
                    <LibraryMark library={candidate} />
                    <span className="hidden min-w-0 flex-1 truncate @3xl/dialog:inline">{candidate.name}</span>
                    {candidate.installed && (
                      <Badge variant="secondary" className="hidden text-[11px] @3xl/dialog:inline-flex">
                        Added
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {libraries.length === 0 && (
            <LoaderCircle aria-label="Loading" className="m-auto size-5 animate-spin text-muted-foreground" />
          )}
          {library && (
            <LibraryDetail key={library.id} library={library} previews={previews} onAdd={onAdd} onRemove={onRemove} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The previews asked for while the dialog is open, by library and settings, each asked for once. */
function usePreviews(load: (library: string, settings?: Record<string, string>) => Promise<ShownPreview | undefined>) {
  const [shown, setShown] = useState<ReadonlyMap<string, ShownPreview | undefined>>(() => new Map())
  const asked = useRef(new Set<string>())

  const want = useCallback(
    (library: string, settings: Record<string, string> | undefined) => {
      const key = previewKey(library, settings)

      if (asked.current.has(key)) {
        return
      }

      asked.current.add(key)
      const settle = (preview: ShownPreview | undefined) => setShown((previews) => new Map(previews).set(key, preview))
      void load(library, settings).then(settle, () => settle(undefined))
    },
    [load]
  )

  return { shown, want }
}

type Previews = ReturnType<typeof usePreviews>

function previewKey(library: string, settings: Record<string, string> | undefined): string {
  return `${library} ${JSON.stringify(settings ?? {})}`
}

/** A library's logo on a tile, in its brand's color, or a plain block for one without. */
function LibraryMark({ library, large = false }: { library: OfferedLibrary; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border bg-background [&_[data-brand]]:text-(--brand) ${large ? "size-11 rounded-lg" : "size-8 rounded-md"}`}
    >
      <AdapterLogo logo={library.logo} className={large ? "size-6" : "size-4.5"} />
    </span>
  )
}

function LibraryDetail({
  library,
  previews,
  onAdd,
  onRemove
}: {
  library: OfferedLibrary
  previews: Previews
  onAdd: (choice: LibraryChoice) => void
  onRemove: (library: string) => void
}) {
  const initial = Object.fromEntries((library.settings ?? []).map((setting) => [setting.id, setting.value]))
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [step, setStep] = useState<Step>("browse")
  const companion = library.companion
  const [withCompanion, setWithCompanion] = useState(!!companion && !companion.installed)
  const settings = library.settings ? values : undefined
  const preview = previews.shown.get(previewKey(library.id, settings))
  const loading = !previews.shown.has(previewKey(library.id, settings))
  const { want } = previews
  const [theme, setTheme] = useState("default")
  const changed = (library.settings ?? []).some((setting) => values[setting.id] !== setting.value)

  useEffect(() => want(library.id, settings), [want, library.id, settings])

  const add = () =>
    onAdd({
      library: library.id,
      settings: library.settings ? values : undefined,
      companions: companion && withCompanion && !companion.installed ? [companion.id] : []
    })

  return (
    <div className="@container/detail flex min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <header className="flex items-start gap-4 px-6 pt-5">
          <LibraryMark library={library} large />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl font-semibold">{library.name}</h2>
              {library.version && <span className="text-sm text-muted-foreground tabular-nums">{library.version}</span>}
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">{library.description}</p>
            <LibraryLinks links={library.links} />
          </div>
        </header>
        {step === "settings" && library.settings && (
          <FieldGroup className="mx-6 mt-5 grid w-auto grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-4 @xl/detail:grid-cols-2">
            {library.settings.map((setting) => (
              <SettingField
                key={setting.id}
                setting={setting}
                value={values[setting.id] ?? setting.value}
                onChange={(value) => setValues({ ...values, [setting.id]: value })}
              />
            ))}
          </FieldGroup>
        )}
        {loading && (
          <LoaderCircle aria-label="Loading" className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
        )}
        {preview && (
          <>
            {library.look && (
              <LookPreview name={library.name} look={library.look} preview={preview} theme={theme} onTheme={setTheme} />
            )}
            <Figures preview={preview} />
            <TokenSpecimens tokens={preview.tokens} keyframes={preview.keyframes} theme={theme} />
            <Families families={preview.families} total={preview.components} />
            <Breakpoints breakpoints={preview.breakpoints} />
          </>
        )}
      </div>
      <footer className="flex min-h-14 flex-wrap items-center gap-3 border-t px-6 py-3">
        {step === "remove" ? (
          <RemoveConfirm library={library} onCancel={() => setStep("browse")} onRemove={() => onRemove(library.id)} />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              {companion && step === "browse" && (
                <Field orientation="horizontal" className="items-center gap-2">
                  <Checkbox
                    id={`companion-${companion.id}`}
                    checked={companion.installed || withCompanion}
                    disabled={companion.installed || library.installed}
                    onCheckedChange={(checked) => setWithCompanion(checked)}
                  />
                  <FieldLabel htmlFor={`companion-${companion.id}`} className="text-sm font-normal">
                    {companion.installed ? `${companion.name} added` : `Add ${companion.name}, its icon set`}
                  </FieldLabel>
                </Field>
              )}
            </div>
            <DetailActions library={library} step={step} changed={changed} onStep={setStep} onAdd={add} />
          </>
        )}
      </footer>
    </div>
  )
}

function RemoveConfirm({
  library,
  onCancel,
  onRemove
}: {
  library: OfferedLibrary
  onCancel: () => void
  onRemove: () => void
}) {
  return (
    <>
      <p className="min-w-0 flex-1 text-sm">
        Remove {library.name} from the project?{" "}
        <span className="text-muted-foreground">This uninstalls {library.package}.</span>
      </p>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onRemove}>
        Remove
      </Button>
    </>
  )
}

/** The footer's buttons: Remove for a library the project has, then Add, or Next to its settings and Add from there. */
function DetailActions({
  library,
  step,
  changed,
  onStep,
  onAdd
}: {
  library: OfferedLibrary
  step: Exclude<Step, "remove">
  changed: boolean
  onStep: (step: Step) => void
  onAdd: () => void
}) {
  if (step === "settings") {
    return (
      <>
        <Button key="back" variant="ghost" onClick={() => onStep("browse")}>
          Back
        </Button>
        <Button disabled={library.installed && !changed} onClick={onAdd}>
          {library.installed ? "Apply" : `Add ${library.name}`}
        </Button>
      </>
    )
  }

  const remove = library.installed && (
    <Button key="remove" variant="ghost" className="text-destructive" onClick={() => onStep("remove")}>
      Remove
    </Button>
  )

  if (library.settings) {
    return (
      <>
        {remove}
        <Button onClick={() => onStep("settings")}>{library.installed ? "Change" : "Next"}</Button>
      </>
    )
  }

  return (
    <>
      {remove}
      <Button disabled={library.installed} onClick={onAdd}>
        {library.installed ? "Added" : `Add ${library.name}`}
      </Button>
    </>
  )
}

function LibraryLinks({ links }: { links: OfferedLibrary["links"] }) {
  const named = [
    { label: "Website", url: links.website },
    { label: "Documentation", url: links.docs },
    { label: "Storybook", url: links.storybook },
    { label: "Source", url: links.source }
  ].filter((link): link is { label: string; url: string } => !!link.url)

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {named.map((link) => (
        <li key={link.label}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-sm underline-offset-2 hover:underline"
          >
            {link.label}
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  )
}

function SettingField({
  setting,
  value,
  onChange
}: {
  setting: LibrarySetting
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()

  return (
    <Field orientation="horizontal" className="items-center *:data-[slot=field-label]:flex-none">
      <FieldLabel id={id} className="w-14 text-sm font-normal text-muted-foreground">
        {setting.label}
      </FieldLabel>
      <AppSelect
        variant="dialog"
        aria-labelledby={id}
        className="w-full min-w-0 flex-1"
        items={setting.options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next)
          }
        }}
      />
    </Field>
  )
}

/** A section's heading: what it holds, with its icon and how many there are. */
function SectionHeading({
  id,
  icon: Icon,
  title,
  count,
  children
}: {
  id: string
  icon: LucideIcon
  title: string
  count: number
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
      {children && <div className="ml-auto">{children}</div>}
    </div>
  )
}

/** The name a theme context goes by, the default being the light one. */
function themeLabel(theme: string): string {
  if (theme === "default") {
    return "Light"
  }

  const words = theme.split("-").join(" ")

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** What each part of a look comes to in `theme`, from the tokens it names. */
function lookIn(look: LibraryLook, tokens: readonly PreviewToken[], theme: string) {
  const byName = new Map(tokens.map((token) => [token.name, token]))

  const value = (name: string | undefined) => {
    const token = name === undefined ? undefined : byName.get(name)

    return token && (token.values[theme] ?? token.values.default)
  }

  return {
    primary: value(look.primary),
    onPrimary: value(look.onPrimary),
    surface: value(look.surface),
    text: value(look.text),
    muted: value(look.muted),
    border: value(look.border),
    radius: value(look.radius),
    font: value(look.font),
    shadow: value(look.shadow)
  }
}

/** A font token's value as style: a shorthand, as `400 1rem/1.5 "Roboto"`, sets `font`; anything else the family. */
function fontStyle(font: string | undefined): CSSProperties {
  if (!font) {
    return {}
  }

  return /^\d{3}\s/.test(font) ? { font } : { fontFamily: font }
}

function ThemePicker({
  themes,
  theme,
  onTheme
}: {
  themes: { value: string; label: string }[]
  theme: string
  onTheme: (theme: string) => void
}) {
  if (themes.length > 2) {
    return (
      <AppSelect
        variant="panel"
        aria-label="Theme"
        items={themes}
        value={theme}
        onValueChange={(next) => {
          if (next) {
            onTheme(next)
          }
        }}
      />
    )
  }

  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Theme"
      value={[theme]}
      onValueChange={(next: string[]) => {
        if (next[0]) {
          onTheme(next[0])
        }
      }}
      className="bg-background"
    >
      {themes.map((each) => (
        <ToggleGroupItem key={each.value} value={each.value} className="text-xs">
          {each.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The library's look, drawn with nothing but its tokens: a card on its surface, with a heading and quieter text, a
 * field, its main button and a plain one, and a tag, in whichever of its themes is chosen.
 */
function LookPreview({
  name,
  look,
  preview,
  theme,
  onTheme
}: {
  name: string
  look: LibraryLook
  preview: ShownPreview
  theme: string
  onTheme: (theme: string) => void
}) {
  const drawn = lookIn(look, preview.tokens, theme)
  const corner = drawn.radius

  return (
    <section aria-label={`${name}'s look`} className="mx-6 mt-5">
      <div
        className="flex flex-col gap-4 overflow-hidden rounded-xl border p-4 @lg/detail:p-6"
        style={{ background: `color-mix(in srgb, ${drawn.text ?? "#000"} 6%, ${drawn.surface ?? "transparent"})` }}
      >
        <div className="flex justify-end">
          <ThemePicker
            themes={preview.themes.map((each) => ({ value: each, label: themeLabel(each) }))}
            theme={theme}
            onTheme={onTheme}
          />
        </div>
        <div
          className="mx-auto mb-2 flex w-full max-w-sm flex-col gap-4 border p-5"
          style={{
            background: drawn.surface,
            color: drawn.text,
            borderColor: drawn.border,
            borderRadius: corner,
            boxShadow: drawn.shadow,
            ...fontStyle(drawn.font)
          }}
        >
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: "1.125em", fontWeight: 600 }}>Weekly report</span>
            <span style={{ color: drawn.muted, fontSize: "0.875em" }}>Three new sign-ups since Monday</span>
          </div>
          <span
            className="flex h-9 items-center border px-3"
            style={{ borderColor: drawn.border, borderRadius: corner, color: drawn.muted, fontSize: "0.875em" }}
          >
            Search reports
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-9 items-center px-4"
              style={{
                background: drawn.primary,
                color: drawn.onPrimary,
                borderRadius: corner,
                fontSize: "0.875em",
                fontWeight: 500
              }}
            >
              Share
            </span>
            <span
              className="inline-flex h-9 items-center border px-4"
              style={{ borderColor: drawn.border, borderRadius: corner, fontSize: "0.875em", fontWeight: 500 }}
            >
              Export
            </span>
            <span
              className="ml-auto inline-flex h-6 items-center px-2"
              style={{
                background: `color-mix(in srgb, ${drawn.primary ?? "currentColor"} 14%, transparent)`,
                color: drawn.primary,
                borderRadius: corner,
                fontSize: "0.75em",
                fontWeight: 500
              }}
            >
              New
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** What the file holds, counted: components, tokens, themes and breakpoints. */
function Figures({ preview }: { preview: ShownPreview }) {
  const figures = [
    { count: preview.components, label: "components" },
    { count: preview.tokens.length, label: "tokens" },
    { count: preview.themes.length, label: preview.themes.length === 1 ? "theme" : "themes" },
    { count: preview.breakpoints.length, label: "breakpoints" }
  ].filter((figure) => figure.count > 0)

  return (
    <ul className="mx-6 mt-4 grid grid-cols-2 gap-3 @xl/detail:grid-cols-4">
      {figures.map((figure) => (
        <li key={figure.label} className="flex flex-col rounded-lg border px-4 py-3">
          <span className="text-2xl font-semibold tabular-nums">{figure.count}</span>
          <span className="text-xs text-muted-foreground">{figure.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** The theme a token is drawn in: the one chosen when it has a value there, else its default, which others inherit. */
function themeOf(token: PreviewToken, theme: string): string {
  return theme in token.values ? theme : "default"
}

/**
 * The tokens, a tab for each of the Tokens panel's sections, every one drawn as its tiles are, in the theme chosen. An
 * animation runs the library's own keyframes.
 */
function TokenSpecimens({
  tokens,
  keyframes = [],
  theme
}: {
  tokens: readonly PreviewToken[]
  keyframes?: ShownPreview["keyframes"]
  theme: string
}) {
  const sections = tokenSections
    .filter((section) => shownSections.has(section.title))
    .map((section) => {
      const kinds = new Set<PreviewKind>(section.kinds.map(({ kind }) => kind))

      return { title: section.title, tokens: tokens.filter((token) => kinds.has(token.kind)) }
    })
    .filter((section) => section.tokens.length > 0)

  const [first] = sections

  if (!first) {
    return null
  }

  return (
    <section aria-labelledby="library-tokens" className="mx-6 mt-8">
      <Keyframes.Provider value={(name) => keyframes.find((each) => each.name === name)?.frames}>
        <SectionHeading id="library-tokens" icon={Palette} title="Tokens" count={tokens.length} />
        <Tabs defaultValue={first.title} className="mt-3 gap-4">
          <TabsList
            variant="line"
            className="max-w-full flex-wrap justify-start gap-y-2 group-data-horizontal/tabs:h-auto"
            aria-label="Kinds of token"
          >
            {sections.map((section) => (
              <TabsTrigger key={section.title} value={section.title} className="h-7 flex-none gap-1.5 text-xs">
                {section.title}
                <span className="text-muted-foreground tabular-nums">{section.tokens.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((section) => (
            <TabsContent key={section.title} value={section.title}>
              <TokenGrid colors={section.title === "Colors"} tokens={section.tokens} theme={theme} />
            </TabsContent>
          ))}
        </Tabs>
      </Keyframes.Provider>
    </section>
  )
}

/** Every token of a kind: colors as swatches, named where the pointer rests; others as the Tokens panel's tiles. */
function TokenGrid({ colors, tokens, theme }: { colors: boolean; tokens: PreviewToken[]; theme: string }) {
  if (colors) {
    return (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
        {tokens.map((token) => (
          <li key={token.name} title={token.name} className="h-8 overflow-hidden rounded-md border">
            <TokenTile token={token} width={40} height={32} theme={themeOf(token, theme)} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,9.5rem)] justify-between gap-2">
      {tokens.map((token) => (
        <TokenSpecimen key={token.name} token={token} theme={theme} />
      ))}
    </ul>
  )
}

/**
 * A token as the Tokens panel's tile draws it: its preview, with its name and value under it. Motion plays while the
 * pointer or keyboard is on it, as there, and pressing it keeps it playing.
 */
function TokenSpecimen({ token, theme }: { token: PreviewToken; theme: string }) {
  const [held, setHeld] = useState(false)
  const { playing, handlers } = useHoverPlay(token.kind, held)
  const value = valueLabel(token)
  const tile = "flex w-full min-w-0 flex-col gap-1 rounded-md p-1 text-left hover:bg-accent/50"

  const content = (
    <>
      <TokenTile token={token} width={144} height={58} playing={playing} theme={themeOf(token, theme)} />
      <span className="flex min-w-0 items-baseline gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate font-mono text-2xs">{token.name}</span>
        {value && <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">{value}</span>}
      </span>
    </>
  )

  return (
    <li {...handlers} title={token.name} className="flex min-w-0">
      {moving.has(token.kind) ? (
        <button
          type="button"
          aria-pressed={held}
          onClick={() => setHeld(!held)}
          className={`${tile} outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent`}
        >
          {content}
        </button>
      ) : (
        <div className={tile}>{content}</div>
      )}
    </li>
  )
}

/** Every component, by family, with how many parts each has. */
function Families({ families, total }: { families: ShownPreview["families"]; total: number }) {
  return (
    <section aria-labelledby="library-components" className="mx-6 mt-8">
      <SectionHeading id="library-components" icon={Component} title="Components" count={total} />
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {families.map((family) => (
          <li key={family.name} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            {family.name}
            {family.count > 1 && <span className="text-muted-foreground tabular-nums">{family.count}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The breakpoints on a ruler from nothing to the widest, each a tick where its width falls. Each one's name and width
 * end at its tick, on a line of their own above the ruler and over any tick that passes behind, so ticks close
 * together never put one label over another, and a longer label always means a wider breakpoint.
 */
function Breakpoints({ breakpoints }: { breakpoints: ShownPreview["breakpoints"] }) {
  if (breakpoints.length === 0) {
    return null
  }

  const sorted = breakpoints.toSorted((first, second) => first.width - second.width)
  const widest = sorted.at(-1)!.width
  const row = 24

  return (
    <section aria-labelledby="library-breakpoints" className="mx-6 mt-8">
      <SectionHeading id="library-breakpoints" icon={Ruler} title="Breakpoints" count={breakpoints.length} />
      <ol className="relative mt-3 border-b border-foreground/40" style={{ height: sorted.length * row + 8 }}>
        {sorted.map((breakpoint, index) => {
          const share = (breakpoint.width / widest) * 100
          const top = index * row

          return (
            <li key={breakpoint.id}>
              <span
                aria-hidden
                className="absolute bottom-0 w-px bg-foreground/40"
                style={{ left: `calc(${share}% - 1px)`, top: top + 8 }}
              />
              <span
                className="absolute left-0 flex justify-end text-xs whitespace-nowrap"
                style={{ width: `${share}%`, top }}
              >
                <span className="flex min-w-0 items-baseline gap-1.5 bg-popover pr-2">
                  <span title={breakpoint.name} className="min-w-0 truncate">
                    {breakpoint.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{breakpoint.width}px</span>
                </span>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-1 flex justify-between text-2xs text-muted-foreground tabular-nums">
        <span>0px</span>
        <span>{widest}px</span>
      </div>
    </section>
  )
}
