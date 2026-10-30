import { Apple, Clock, Hand, Heart, Leaf, Lightbulb, Search, Smile, SmilePlus } from "lucide-react"
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  emojiCategories,
  type EmojiEntry,
  findEmoji,
  searchEmoji,
  shortcode,
  skinTones,
  withTone
} from "./emoji-data.ts"

/** What you've picked lately, most recent first, and your skin tone: shared by every picker. */
let prefs = { recent: ["👍", "❤️", "😂", "🎉", "👀", "🙏", "🔥", "✅"], tone: "" }
const listeners = new Set<() => void>()

function update(next: typeof prefs) {
  prefs = next
  for (const listener of listeners) listener()
}

export function useEmojiPrefs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => prefs
  )
}

/** Moves an emoji to the front of Frequently used. */
export function rememberEmoji(emoji: string) {
  update({ ...prefs, recent: [emoji, ...prefs.recent.filter((other) => other !== emoji)].slice(0, 16) })
}

/** An emoji as you'd pick it: in your skin tone when it takes one. */
function picked(entry: EmojiEntry, tone: string) {
  return withTone(entry, tone)
}

const categoryIcons: Record<string, typeof Smile> = {
  recent: Clock,
  smileys: Smile,
  people: Hand,
  nature: Leaf,
  food: Apple,
  objects: Lightbulb,
  symbols: Heart
}

const columns = 8

/**
 * The emoji picker: search by name or keyword, Frequently used first (it learns from what you pick), then each
 * category, with tabs to jump between them. Arrow keys move through the grid while you type, Enter picks, and the
 * footer names what's under the pointer. Hands and people take your skin tone.
 */
export function EmojiPicker({
  onPick,
  initialQuery = "",
  className = ""
}: {
  onPick: (emoji: string) => void
  initialQuery?: string
  className?: string
}) {
  const { recent, tone } = useEmojiPrefs()
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState<EmojiEntry>()
  const [tones, setTones] = useState(false)
  const [section, setSection] = useState("recent")
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const sections = query.trim()
    ? [{ id: "results", title: "Results", emojis: searchEmoji(query) }]
    : [
        { id: "recent", title: "Frequently used", emojis: recent.map(findEmoji).filter((entry) => !!entry) },
        ...emojiCategories
      ]
  const flat = sections.flatMap((candidate) => candidate.emojis)
  const current = flat[Math.min(active, flat.length - 1)]
  const shown = hovered ?? current

  useEffect(() => searchRef.current?.focus(), [])
  // Scrolls the grid only up and down to keep the active emoji in view, below the sticky heading. scrollIntoView
  // could nudge it sideways too, clipping the first column.
  useEffect(() => {
    const grid = gridRef.current
    const cell = grid?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    if (!grid || !cell) return
    const top = cell.offsetTop - 28
    const bottom = cell.offsetTop + cell.offsetHeight + 4
    if (top < grid.scrollTop) grid.scrollTop = top
    else if (bottom > grid.scrollTop + grid.clientHeight) grid.scrollTop = bottom - grid.clientHeight
  }, [active])

  const pick = (entry: EmojiEntry) => {
    rememberEmoji(entry.emoji)
    onPick(picked(entry, tone))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
    if (event.key in moves && flat.length) {
      event.preventDefault()
      setHovered(undefined)
      setActive(Math.max(0, Math.min(flat.length - 1, active + moves[event.key]!)))
    } else if (event.key === "Enter" && current) {
      event.preventDefault()
      pick(current)
    }
  }
  // Sections are measured by their wrappers: a stuck heading reports where it's stuck.
  const jump = (id: string) => {
    const wrapper = gridRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`)
    if (wrapper && gridRef.current) gridRef.current.scrollTop = wrapper.offsetTop
    setSection(id)
  }
  const onScroll = () => {
    const grid = gridRef.current
    if (!grid || query.trim()) return
    const wrappers = [...grid.querySelectorAll<HTMLElement>("[data-section]")]
    const last = wrappers.findLast((wrapper) => wrapper.offsetTop <= grid.scrollTop + 4)
    if (last) setSection(last.dataset.section!)
  }

  let offset = 0
  return (
    <div className={`flex w-[19.5rem] flex-col text-popover-foreground ${className}`}>
      <div className="flex items-center gap-1.5 p-2">
        <label className="flex h-8 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:border-ring">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            aria-label="Search emoji"
            placeholder="Search emoji"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
              setHovered(undefined)
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="relative">
          <button
            type="button"
            aria-label="Skin tone"
            aria-expanded={tones}
            onClick={() => setTones(!tones)}
            className="grid size-8 place-items-center rounded-md text-lg hover:bg-muted"
          >
            {withTone(findEmoji("✋")!, tone)}
          </button>
          {tones && (
            <div className="absolute top-full right-0 z-10 mt-1 flex gap-0.5 rounded-lg border bg-popover p-1 shadow-xl">
              {skinTones.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  title={option.name}
                  aria-pressed={tone === option.modifier}
                  onClick={() => {
                    update({ ...prefs, tone: option.modifier })
                    setTones(false)
                  }}
                  className={`grid size-8 place-items-center rounded-md text-lg hover:bg-muted ${tone === option.modifier ? "bg-muted" : ""}`}
                >
                  {withTone(findEmoji("✋")!, option.modifier)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!query.trim() && (
        <div className="flex justify-between border-b px-2 pb-1.5">
          {sections.map((candidate) => {
            const Icon = categoryIcons[candidate.id] ?? Smile
            return (
              <button
                key={candidate.id}
                type="button"
                title={candidate.title}
                aria-label={candidate.title}
                aria-pressed={section === candidate.id}
                onClick={() => jump(candidate.id)}
                className={`grid size-7 place-items-center rounded-md ${section === candidate.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>
      )}
      <div ref={gridRef} onScroll={onScroll} className="relative h-64 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {sections.map((candidate) => {
          const start = offset
          offset += candidate.emojis.length
          return (
            <div key={candidate.id} data-section={candidate.id}>
              <div className="sticky top-0 z-[1] bg-popover pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                {candidate.title}
              </div>
              <div className="grid grid-cols-8">
                {candidate.emojis.map((entry, index) => {
                  const position = start + index
                  return (
                    <button
                      key={`${candidate.id}:${entry.emoji}`}
                      type="button"
                      data-index={position}
                      title={entry.name}
                      aria-label={entry.name}
                      onClick={() => pick(entry)}
                      onMouseEnter={() => setHovered(entry)}
                      onMouseLeave={() => setHovered(undefined)}
                      className={`grid size-[34px] place-items-center overflow-visible rounded-md text-[20px] leading-[1.25] hover:bg-muted ${position === active && !hovered ? "bg-accent ring-1 ring-ring ring-inset" : ""}`}
                    >
                      {picked(entry, tone)}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {flat.length === 0 && (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">No emoji for “{query.trim()}”</p>
        )}
      </div>
      <div className="flex h-12 items-center gap-2.5 border-t px-3">
        {shown ? (
          <>
            <span className="text-[26px] leading-[1.2]">{picked(shown, tone)}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] capitalize">{shown.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{shortcode(shown)}</span>
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Pick an emoji</span>
        )}
      </div>
    </div>
  )
}

/** The picker in a popover on whatever opens it, closing once an emoji is picked. */
export function EmojiPopover({
  children,
  onPick,
  align = "start",
  side = "top"
}: {
  /** The button that opens it. */
  children: ReactElement
  onPick: (emoji: string) => void
  align?: "start" | "center" | "end"
  side?: "top" | "bottom"
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-auto p-0">
        <EmojiPicker
          onPick={(emoji) => {
            onPick(emoji)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Emoji for a shortcode being typed, as in :thu, with the arrow keys and Enter to pick. */
export function EmojiSuggest({
  matches,
  active = 0,
  onPick,
  className = ""
}: {
  matches: EmojiEntry[]
  active?: number
  onPick?: (entry: EmojiEntry) => void
  className?: string
}) {
  const { tone } = useEmojiPrefs()
  return (
    <div className={`w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl ${className}`}>
      <div className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">Emoji</div>
      {matches.map((entry, index) => (
        <button
          key={entry.emoji}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick?.(entry)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left ${index === active ? "bg-accent" : "hover:bg-accent/60"}`}
        >
          <span className="text-lg leading-[1.2]">{picked(entry, tone)}</span>
          <span className="truncate text-[13px] text-muted-foreground">{shortcode(entry)}</span>
        </button>
      ))}
    </div>
  )
}

/** The emoji for a picked suggestion, in your tone, and remembered as used. */
export function pickSuggestion(entry: EmojiEntry): string {
  rememberEmoji(entry.emoji)
  return picked(entry, prefs.tone)
}

/** The five you react with most, one click each, beside the reactions smiley. */
export function QuickReactions({ onPick }: { onPick: (emoji: string) => void }) {
  const { recent, tone } = useEmojiPrefs()
  return (
    <>
      {recent
        .slice(0, 5)
        .map(findEmoji)
        .filter((entry) => !!entry)
        .map((entry) => (
          <button
            key={entry.emoji}
            type="button"
            aria-label={`React with ${entry.name}`}
            onClick={() => {
              rememberEmoji(entry.emoji)
              onPick(picked(entry, tone))
            }}
            className="grid size-6 place-items-center rounded-[min(var(--radius-md),10px)] text-sm hover:bg-muted"
          >
            {picked(entry, tone)}
          </button>
        ))}
    </>
  )
}

/**
 * The smiley after a comment's reactions. Hovering it slides out the five you use most, right beside it; clicking it
 * opens every emoji.
 */
export function ReactionAdder({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <span className="group/add flex h-6 items-center rounded-full border text-muted-foreground hover:bg-muted/40 has-[[data-state=open]]:bg-muted">
      <EmojiPopover onPick={onPick}>
        <button
          type="button"
          aria-label="Add a reaction"
          className="grid size-6 shrink-0 place-items-center rounded-full hover:text-foreground"
        >
          <SmilePlus className="size-3.5" />
        </button>
      </EmojiPopover>
      <span className="hidden items-center pr-0.5 group-focus-within/add:flex group-hover/add:flex">
        <QuickReactions onPick={onPick} />
      </span>
    </span>
  )
}
