import {
  ArrowUp,
  AtSign,
  BellOff,
  Camera,
  Check,
  Ellipsis,
  Layers,
  Link,
  Mail,
  Pencil,
  RotateCcw,
  Search,
  SmilePlus,
  Trash2,
  X
} from "lucide-react"
import { Fragment, type KeyboardEvent, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { me, type Person } from "../explore-data.ts"
import { accent, Avatar } from "../parts.tsx"
import { type CommentData, everyone, mentionable, type Reaction, type ThreadData } from "./collab-data.ts"

/** Unread, and what you've reacted with: the comments' one accent. */
export const commentBlue = "oklch(0.65 0.18 250)"

function nameOf(person: Person): string {
  return person === me ? "You" : person.name
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const parts = new RegExp(`(@(?:${everyone.map((person) => escape(person.name)).join("|")})|\\{[^}]+\\})`)

/** A comment's text: mentions in the person's color (yours highlighted), and layers as links that select them. */
export function CommentText({ text }: { text: string }) {
  return (
    <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
      {text.split(parts).map((part, index) => {
        const person = everyone.find((candidate) => `@${candidate.name}` === part)
        if (person) return <Mention key={index} person={person} />
        if (part.startsWith("{") && part.endsWith("}")) return <LayerLink key={index} name={part.slice(1, -1)} />
        return part
      })}
    </p>
  )
}

function Mention({ person }: { person: Person }) {
  return person === me ? (
    <span className="rounded bg-[oklch(0.8_0.14_85/0.16)] px-0.5 font-medium text-[oklch(0.87_0.12_85)]">
      @{person.name}
    </span>
  ) : (
    <span className="font-medium" style={{ color: accent(person.hue, 0.8, 0.11) }}>
      @{person.name}
    </span>
  )
}

/** A layer named in a comment: clicking it selects the layer and brings it into view. */
export function LayerLink({ name }: { name: string }) {
  return (
    <button
      type="button"
      title="Select this layer"
      className="mx-px inline-flex items-center gap-1 rounded bg-muted px-1 align-baseline text-[12px] font-medium text-foreground hover:bg-accent"
    >
      <Layers className="size-3 text-muted-foreground" />
      {name}
    </button>
  )
}

/** Adds your reaction, or takes it back. */
export function toggleReaction(reactions: Reaction[] = [], emoji: string): Reaction[] {
  const existing = reactions.find((reaction) => reaction.emoji === emoji)
  if (!existing) return [...reactions, { emoji, by: [me] }]
  const by = existing.by.includes(me) ? existing.by.filter((person) => person !== me) : [...existing.by, me]
  return reactions
    .map((reaction) => (reaction === existing ? { ...reaction, by } : reaction))
    .filter((reaction) => reaction.by.length > 0)
}

/** Emoji reactions under a comment, with who reacted on hover. Yours are tinted. */
export function Reactions({ reactions, onToggle }: { reactions: Reaction[]; onToggle?(emoji: string): void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {reactions.map((reaction) => {
        const mine = reaction.by.includes(me)
        return (
          <button
            key={reaction.emoji}
            type="button"
            aria-pressed={mine}
            title={reaction.by.map(nameOf).join(", ")}
            onClick={() => onToggle?.(reaction.emoji)}
            className={`flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums ${
              mine
                ? "border-[oklch(0.65_0.18_250/0.5)] bg-[oklch(0.65_0.18_250/0.15)] text-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="text-[13px]">{reaction.emoji}</span>
            {reaction.by.length}
          </button>
        )
      })}
      <button
        type="button"
        aria-label="Add a reaction"
        onClick={() => onToggle?.("👍")}
        className="grid size-6 place-items-center rounded-full border text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <SmilePlus className="size-3.5" />
      </button>
    </div>
  )
}

/** A snapshot of the frame, taken with the comment so it still makes sense after the design changes. */
export function Snapshot({ frame, onRemove }: { frame: string; onRemove?(): void }) {
  return (
    <div className="flex w-fit items-center gap-2.5 rounded-lg border bg-background/60 p-1.5 pr-2 text-xs">
      <span className="flex h-11 w-8 flex-col gap-1 rounded bg-white p-1 ring-1 ring-border">
        <span className="h-1 w-4 rounded-full bg-neutral-300" />
        <span className="h-3 rounded-sm bg-neutral-200" />
        <span className="h-1 w-5 rounded-full bg-neutral-300" />
        <span className="h-1 w-3 rounded-full bg-neutral-300" />
      </span>
      <span className="flex flex-col">
        <span className="font-medium">Snapshot</span>
        <span className="text-muted-foreground">{frame}</span>
      </span>
      {onRemove && (
        <Button size="icon-xs" variant="ghost" aria-label="Remove the snapshot" onClick={onRemove}>
          <X />
        </Button>
      )}
    </div>
  )
}

/** One comment: who, when, the text, a snapshot, reactions; react and more on hover. */
export function Comment({ comment, onReact }: { comment: CommentData; onReact?(emoji: string): void }) {
  return (
    <div className="group/comment relative flex gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/30">
      <Avatar person={comment.author} size={26} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5 text-xs">
          <span className="text-[13px] font-medium">{nameOf(comment.author)}</span>
          {comment.author.agent && (
            <span className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">Agent</span>
          )}
          <span className="text-muted-foreground">{comment.when}</span>
          {comment.edited && <span className="text-muted-foreground">(edited)</span>}
        </div>
        <CommentText text={comment.text} />
        {comment.snapshot && <Snapshot frame={comment.snapshot} />}
        {!!comment.reactions?.length && <Reactions reactions={comment.reactions} onToggle={onReact} />}
      </div>
      <div className="absolute top-1.5 right-1.5 flex rounded-md border bg-popover opacity-0 shadow-sm group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
        <Button size="icon-xs" variant="ghost" aria-label="React" onClick={() => onReact?.("👍")}>
          <SmilePlus />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label="More">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {comment.author === me && (
              <DropdownMenuItem>
                <Pencil /> Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <Link /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Mail /> Mark unread from here
            </DropdownMenuItem>
            {comment.author === me && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/** Who a mention could be, for what's been typed after the @. */
export function mentionOptions(query: string) {
  const typed = query.toLowerCase()
  return mentionable.filter(({ person }) => {
    const name = person.name.toLowerCase()
    return name.startsWith(typed) || name.split(" ").some((word) => word.startsWith(typed))
  })
}

/**
 * Who to mention: people in the project, then agents. Mentioning someone who can't see the project offers to let them
 * comment; mentioning an agent hands it the thread to work on.
 */
export function MentionMenu({
  query = "",
  active = 0,
  onPick,
  className = ""
}: {
  query?: string
  active?: number
  onPick?(person: Person): void
  className?: string
}) {
  const options = mentionOptions(query)
  return (
    <div className={`w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl ${className}`}>
      {options.map((option, index) => {
        const heading =
          index === 0 || options[index - 1]!.person.agent !== option.person.agent
            ? option.person.agent
              ? "Agents"
              : "People"
            : undefined
        return (
          <Fragment key={option.person.name}>
            {heading && <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">{heading}</div>}
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick?.(option.person)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${index === active ? "bg-accent" : "hover:bg-accent/60"}`}
            >
              <Avatar person={option.person} size={22} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px]">{option.person.name}</span>
                <span
                  className={`truncate text-[11px] ${option.outside ? "text-[oklch(0.8_0.13_70)]" : "text-muted-foreground"}`}
                >
                  {option.detail}
                </span>
              </span>
            </button>
          </Fragment>
        )
      })}
      {options.length === 0 && (
        <div className="px-2 py-2 text-[13px] text-muted-foreground">No one called “{query}” in this project</div>
      )}
    </div>
  )
}

const typedMention = /(?:^|\s)@([A-Za-z]*(?: [A-Za-z]*)?)$/

/**
 * Where a comment is written. @ opens the mention menu, Enter sends and Shift+Enter starts a new line; the camera
 * attaches a snapshot of the frame.
 */
export function Composer({
  placeholder = "Add a comment, @ to mention",
  initial = "",
  frame = "Desktop, Dark",
  menuSide = "top",
  onSend,
  className = ""
}: {
  placeholder?: string
  initial?: string
  /** The frame a snapshot would capture. */
  frame?: string
  menuSide?: "top" | "bottom"
  onSend?(text: string, snapshot: boolean): void
  className?: string
}) {
  const [text, setText] = useState(initial)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string>()
  const [snapshot, setSnapshot] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const query = typedMention.exec(text)?.[1]
  const options = query === undefined ? [] : mentionOptions(query)
  const open = query !== undefined && options.length > 0 && dismissed !== text
  const index = Math.min(active, options.length - 1)

  const change = (next: string) => {
    setText(next)
    setActive(0)
  }
  const pick = (person: Person) => {
    change(`${text.slice(0, text.length - query!.length - 1)}@${person.name} `)
    area.current?.focus()
  }
  const send = () => {
    if (!text.trim()) return
    onSend?.(text.trim(), snapshot)
    change("")
    setSnapshot(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault()
      setActive((index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length)
    } else if (open && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault()
      pick(options[index]!.person)
    } else if (open && event.key === "Escape") {
      setDismissed(text)
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className={`relative rounded-xl border bg-background focus-within:border-ring ${className}`}>
      {open && (
        <MentionMenu
          query={query}
          active={index}
          onPick={pick}
          className={`absolute left-2 z-20 ${menuSide === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        />
      )}
      <Textarea
        ref={area}
        value={text}
        rows={1}
        aria-label="Comment"
        placeholder={placeholder}
        onChange={(event) => change(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-40 min-h-0 resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-[13px] shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
      />
      {snapshot && (
        <div className="px-3 pt-1 pb-1">
          <Snapshot frame={frame} onRemove={() => setSnapshot(false)} />
        </div>
      )}
      <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Mention someone"
          className="text-muted-foreground"
          onClick={() => {
            change(text && !/\s$/.test(text) ? `${text} @` : `${text}@`)
            area.current?.focus()
          }}
        >
          <AtSign />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Add an emoji" className="text-muted-foreground">
          <SmilePlus />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Attach a snapshot of this frame"
          aria-pressed={snapshot}
          className={snapshot ? "text-foreground" : "text-muted-foreground"}
          onClick={() => setSnapshot(!snapshot)}
        >
          <Camera />
        </Button>
        <Button
          size="icon-xs"
          className="ml-auto rounded-full"
          aria-label="Send"
          disabled={!text.trim()}
          onClick={send}
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  )
}

/** An agent a thread mentioned, at work on what it asks: who, what, and a way to watch it on the canvas. */
export function AgentWorking({ agent, label }: { agent: Person; label: string }) {
  const palette = agentPalettes[7]!
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs"
      style={{
        borderColor: `color-mix(in oklch, ${palette.color} 40%, transparent)`,
        background: `color-mix(in oklch, ${palette.color} 9%, transparent)`
      }}
    >
      <span className="relative">
        <Avatar person={agent} size={22} />
        <span
          className="absolute -right-0.5 -bottom-0.5 size-2.5 animate-pulse rounded-full ring-2 ring-popover"
          style={{ background: palette.color }}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span>
          <span className="font-medium">{agent.name}</span> is working on this
        </span>
        <span className="truncate text-muted-foreground">{label}</span>
      </span>
      <Button size="xs" variant="ghost">
        Show me
      </Button>
    </div>
  )
}

function ThreadMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="More">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem>
          <Mail /> Mark as unread
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Link /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem>
          <BellOff /> Mute this thread
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2 /> Delete thread
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A thread, as it opens beside its pin: where it is, resolve and more, the comments (long threads fold their middle),
 * an agent at work when one was mentioned, and the reply box. Resolving folds the reply box away; Reopen brings it back.
 */
export function Thread({
  thread: initial,
  onClose,
  className = ""
}: {
  thread: ThreadData
  onClose?(): void
  className?: string
}) {
  const [thread, setThread] = useState(initial)
  const [expanded, setExpanded] = useState(false)
  const resolve = () =>
    setThread((current) => ({ ...current, resolved: current.resolved ? undefined : { by: me, when: "Just now" } }))
  const react = (id: string, emoji: string) =>
    setThread((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === id ? { ...comment, reactions: toggleReaction(comment.reactions, emoji) } : comment
      )
    }))
  const reply = (text: string, snapshot: boolean) =>
    setThread((current) => ({
      ...current,
      comments: [
        ...current.comments,
        {
          id: `${current.id}-${current.comments.length + 1}`,
          author: me,
          when: "Just now",
          text,
          snapshot: snapshot ? (current.frame ?? "Desktop") : undefined
        }
      ]
    }))
  const folded = !expanded && thread.comments.length > 4 ? thread.comments.length - 3 : 0
  const shown = folded ? [thread.comments[0]!, ...thread.comments.slice(-2)] : thread.comments

  return (
    <div
      className={`flex w-[22rem] flex-col rounded-xl border bg-popover text-popover-foreground shadow-2xl ${className}`}
    >
      <div className="flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium">
            {thread.comments.length ? "" : "New comment on "}
            {thread.design}
            {thread.layer ? `, ${thread.layer}` : ""}
          </span>
          {thread.frame && <span className="truncate text-[11px] text-muted-foreground">{thread.frame}</span>}
        </span>
        {thread.comments.length > 0 && (
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={thread.resolved ? "Reopen" : "Resolve"}
              aria-pressed={!!thread.resolved}
              onClick={resolve}
              className={thread.resolved ? "text-emerald-400" : ""}
            >
              <Check />
            </Button>
            <ThreadMenu />
          </>
        )}
        {onClose && (
          <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>
      {thread.resolved && (
        <div className="flex items-center gap-2 border-b bg-emerald-500/10 py-1.5 pr-1.5 pl-3 text-xs">
          <Check className="size-3.5 text-emerald-400" />
          <span className="flex-1 text-muted-foreground">
            <span className="font-medium text-foreground">{nameOf(thread.resolved.by)}</span> resolved this,{" "}
            {thread.resolved.when.toLowerCase()}
          </span>
          <Button size="xs" variant="ghost" onClick={resolve}>
            <RotateCcw /> Reopen
          </Button>
        </div>
      )}
      {shown.length > 0 && (
        <div className={`flex max-h-[26rem] flex-col overflow-y-auto p-1.5 ${thread.resolved ? "opacity-70" : ""}`}>
          {shown.map((comment, index) => (
            <Fragment key={comment.id}>
              <Comment comment={comment} onReact={(emoji) => react(comment.id, emoji)} />
              {folded > 0 && index === 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mx-2 my-1 self-start text-xs font-medium"
                  style={{ color: commentBlue }}
                >
                  {folded} more replies
                </button>
              )}
            </Fragment>
          ))}
        </div>
      )}
      {thread.working && !thread.resolved && (
        <div className="px-2 pb-2">
          <AgentWorking agent={thread.working.agent} label={thread.working.label} />
        </div>
      )}
      {!thread.resolved && (
        <div className={`p-2 ${shown.length ? "pt-0" : ""}`}>
          <Composer
            placeholder={thread.comments.length ? "Reply, @ to mention" : "Add a comment, @ to mention"}
            frame={thread.frame}
            onSend={reply}
          />
        </div>
      )}
    </div>
  )
}

/** A thread in the comments list: who started it, the start of what they said, where, and how it stands. */
export function ThreadRow({ thread, selected }: { thread: ThreadData; selected?: boolean }) {
  const first = thread.comments[0]!
  const replies = thread.comments.length - 1
  return (
    <button
      type="button"
      className={`flex w-full gap-2.5 rounded-lg px-2.5 py-2.5 text-left ${selected ? "bg-accent" : "hover:bg-muted/40"}`}
    >
      <Avatar person={first.author} size={24} className={thread.resolved ? "opacity-60" : ""} />
      <span className={`flex min-w-0 flex-1 flex-col gap-1 ${thread.resolved ? "opacity-60" : ""}`}>
        <span className="flex items-baseline gap-1.5 text-xs">
          <span className="text-[13px] font-medium">{nameOf(first.author)}</span>
          <span className="text-muted-foreground">{first.when}</span>
        </span>
        <span className="line-clamp-2 text-[13px] text-foreground/85">{first.text.replace(/\{([^}]+)\}/g, "$1")}</span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {thread.layer && (
            <span className="flex items-center gap-1">
              <Layers className="size-3" /> {thread.layer}
            </span>
          )}
          {replies > 0 && <span>{replies === 1 ? "1 reply" : `${replies} replies`}</span>}
          {thread.resolved && (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="size-3" /> Resolved
            </span>
          )}
          {thread.working && !thread.resolved && (
            <span className="flex items-center gap-1" style={{ color: agentPalettes[7]!.color }}>
              <span className="size-1.5 animate-pulse rounded-full" style={{ background: agentPalettes[7]!.color }} />
              {thread.working.agent.name} is working
            </span>
          )}
        </span>
      </span>
      {thread.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: commentBlue }} />}
    </button>
  )
}

type Filter = "open" | "you" | "resolved"

const filters: { id: Filter; title: string; matches(thread: ThreadData): boolean }[] = [
  { id: "open", title: "Open", matches: (thread) => !thread.resolved },
  {
    id: "you",
    title: "For you",
    matches: (thread) =>
      !thread.resolved &&
      thread.comments.some((comment) => comment.text.includes(`@${me.name}`) || comment.author === me)
  },
  { id: "resolved", title: "Resolved", matches: (thread) => !!thread.resolved }
]

/** Every thread in the project, beside the inspector: open, for you or resolved, grouped by design. */
export function CommentsPanel({ threads, selected }: { threads: ThreadData[]; selected?: string }) {
  const [filter, setFilter] = useState<Filter>("open")
  const shown = threads.filter(filters.find((candidate) => candidate.id === filter)!.matches)
  const designs = [...new Set(shown.map((thread) => thread.design))]
  return (
    <aside className="flex h-full w-80 flex-col border-l bg-background text-foreground">
      <div className="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-3">
        <span className="flex-1 text-sm font-medium">Comments</span>
        <Button size="icon-xs" variant="ghost" aria-label="Search comments">
          <Search />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Comment settings">
          <Ellipsis />
        </Button>
      </div>
      <div className="flex gap-1 px-2 py-2">
        {filters.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={filter === candidate.id}
            onClick={() => setFilter(candidate.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${filter === candidate.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {candidate.title}
            <span className="text-muted-foreground tabular-nums">{threads.filter(candidate.matches).length}</span>
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-3">
        {designs.map((design) => (
          <div key={design} className="flex flex-col">
            <span className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">{design}</span>
            {shown
              .filter((thread) => thread.design === design)
              .map((thread) => (
                <ThreadRow key={thread.id} thread={thread} selected={thread.id === selected} />
              ))}
          </div>
        ))}
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {filter === "you" ? "Nothing waiting on you." : "No comments here yet."}
          </p>
        )}
      </div>
    </aside>
  )
}
