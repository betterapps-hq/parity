import {
  ArrowUp,
  AtSign,
  BellOff,
  Camera,
  Check,
  Component,
  Ellipsis,
  Layers,
  Link,
  Link2,
  type LucideIcon,
  Mail,
  MonitorSmartphone,
  MoveRight,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SmilePlus,
  SquareArrowOutUpRight,
  Trash2,
  Unlink,
  X
} from "lucide-react"
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { me, type Person } from "../explore-data.ts"
import { accent, Avatar } from "../parts.tsx"
import { ProposalCard } from "./approvals.tsx"
import { AttachmentChip, Attachments, DraftPicture, fromFiles, useUploads } from "./attachments.tsx"
import {
  type Attachment,
  type CommentData,
  everyone,
  mentionable,
  type Place,
  type Reaction,
  type ThreadData,
  type TrackerId
} from "./collab-data.ts"
import { searchEmoji } from "./emoji-data.ts"
import { EmojiPopover, EmojiSuggest, pickSuggestion, ReactionAdder } from "./emoji.tsx"
import { IssueDialog, IssueLink, orgTrackers, type Tracker, TrackerMark } from "./issues.tsx"

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

/** Emoji reactions under a comment, with who reacted on hover. Yours are tinted; the smiley after them adds one. */
export function Reactions({ reactions, onToggle }: { reactions: Reaction[]; onToggle?: (emoji: string) => void }) {
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
      <ReactionAdder onPick={(emoji) => onToggle?.(emoji)} />
    </div>
  )
}

/** A snapshot of the frame, taken with the comment so it still makes sense after the design changes. */
export function Snapshot({ frame, onRemove }: { frame: string; onRemove?: () => void }) {
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

/**
 * One comment: who, when, the text, a snapshot, attachments and reactions; on hover, a reaction from every emoji, and
 * more. Your own can be edited in place, or deleted after a second look.
 */
export function Comment({
  comment,
  first,
  canApprove,
  onReact,
  onEdit,
  onDelete,
  onDecide
}: {
  comment: CommentData
  /** The thread's first comment: deleting it deletes the thread. */
  first?: boolean
  /** You can edit, so you can approve what's proposed. */
  canApprove?: boolean
  onReact?: (emoji: string) => void
  onEdit?: (draft: Draft) => void
  onDelete?: () => void
  onDecide?: (status: "approved" | "declined", reason?: string) => void
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view")
  // Leaving the menu for the edit box or the delete check keeps focus there, not on the menu's button.
  const leaving = useRef(false)
  const leaveFor = (next: "edit" | "delete") => {
    leaving.current = true
    setMode(next)
  }
  return (
    <div
      className={`group/comment relative flex gap-2.5 rounded-lg px-2 py-2 ${mode === "view" ? "hover:bg-muted/30" : "bg-muted/30"}`}
    >
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
        {mode === "edit" ? (
          <Composer
            initial={comment.text}
            initialAttachments={comment.attachments}
            focusOnMount
            onCancel={() => setMode("view")}
            onSend={(draft) => {
              onEdit?.(draft)
              setMode("view")
            }}
          />
        ) : (
          <>
            {comment.text && <CommentText text={comment.text} />}
            {comment.proposal && (
              <ProposalCard
                proposal={comment.proposal}
                lines={comment.proposal.changes.map((change) => (
                  <CommentText key={change} text={change} />
                ))}
                agent={comment.author.name}
                canApprove={canApprove}
                onApprove={() => onDecide?.("approved")}
                onDecline={(reason) => onDecide?.("declined", reason || undefined)}
              />
            )}
            {comment.snapshot && <Snapshot frame={comment.snapshot} />}
            {!!comment.attachments?.length && <Attachments items={comment.attachments} />}
            {!!comment.reactions?.length && <Reactions reactions={comment.reactions} onToggle={onReact} />}
          </>
        )}
        {mode === "delete" && (
          <ConfirmDelete
            first={first}
            onCancel={() => setMode("view")}
            onDelete={() => {
              setMode("view")
              onDelete?.()
            }}
          />
        )}
      </div>
      {mode === "view" && (
        <div className="absolute top-1.5 right-1.5 flex rounded-md border bg-popover opacity-0 shadow-sm group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
          <EmojiPopover align="end" onPick={(emoji) => onReact?.(emoji)}>
            <Button size="icon-xs" variant="ghost" aria-label="Add a reaction">
              <SmilePlus />
            </Button>
          </EmojiPopover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="More">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48"
              onCloseAutoFocus={(event) => {
                if (leaving.current) event.preventDefault()
                leaving.current = false
              }}
            >
              {comment.author === me && (
                <DropdownMenuItem onSelect={() => leaveFor("edit")}>
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
                  <DropdownMenuItem variant="destructive" onSelect={() => leaveFor("delete")}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

/** A second look before a comment goes, saying when the whole thread goes with it. Esc changes your mind. */
function ConfirmDelete({ first, onCancel, onDelete }: { first?: boolean; onCancel: () => void; onDelete: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onCancel()
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs">
      <span>
        <span className="font-medium">Delete this comment?</span>{" "}
        <span className="text-muted-foreground">
          {first ? "It started the thread, so the replies go with it." : "Its reactions go with it."}
        </span>
      </span>
      <span className="flex justify-end gap-1.5">
        <Button ref={cancel} size="xs" variant="ghost" onClick={onCancel} onKeyDown={onKeyDown}>
          Cancel
        </Button>
        <Button size="xs" variant="destructive" onClick={onDelete} onKeyDown={onKeyDown}>
          {first ? "Delete thread" : "Delete"}
        </Button>
      </span>
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
  onPick?: (person: Person) => void
  className?: string
}) {
  const options = mentionOptions(query)
  return (
    <div className={`w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl ${className}`}>
      {options.map((option, index) => {
        let heading: string | undefined
        if (index === 0 || options[index - 1]!.person.agent !== option.person.agent)
          heading = option.person.agent ? "Agents" : "People"
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

const typedEmoji = /(?:^|\s):([a-z0-9_+-]{2,})$/i

/** What the composer sends: the text, whether to take a snapshot of the frame, and what's attached. */
export interface Draft {
  text: string
  snapshot: boolean
  attachments: Attachment[]
}

/**
 * Where a comment is written. @ opens the mention menu and a colon with two letters suggests emoji, as in :th; Enter
 * sends and Shift+Enter starts a new line. The smiley opens the emoji picker at the caret, the camera attaches a
 * snapshot of the frame, and the paperclip attaches files, as does dropping or pasting them: pictures show a preview,
 * other files a chip. With `onCancel` it edits a comment instead, with Save and Cancel, and Esc cancels.
 */
export function Composer({
  placeholder = "Add a comment, @ to mention",
  initial = "",
  initialAttachments = [],
  frame = "Desktop, Dark",
  menuSide = "top",
  focusOnMount,
  onSend,
  onCancel,
  className = ""
}: {
  placeholder?: string
  initial?: string
  initialAttachments?: Attachment[]
  /** The frame a snapshot would capture. */
  frame?: string
  menuSide?: "top" | "bottom"
  /** Puts the caret at the end of the text as soon as it shows, as editing a comment does. */
  focusOnMount?: boolean
  onSend?: (draft: Draft) => void
  onCancel?: () => void
  className?: string
}) {
  const [text, setText] = useState(initial)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string>()
  const [snapshot, setSnapshot] = useState(false)
  const [attachments, setAttachments] = useState(initialAttachments)
  const [dragging, setDragging] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const uploading = useUploads(attachments, setAttachments)
  const ready = attachments.filter((attachment) => !attachment.error)
  const canSend = (!!text.trim() || ready.length > 0) && !uploading
  const pictures = attachments.filter((attachment) => attachment.kind === "image")
  const files = attachments.filter((attachment) => attachment.kind === "file")
  const query = typedMention.exec(text)?.[1]
  const emojiQuery = query === undefined ? typedEmoji.exec(text)?.[1] : undefined
  const options = query === undefined ? [] : mentionOptions(query)
  const emoji = emojiQuery === undefined ? [] : searchEmoji(emojiQuery, 6)
  const count = options.length || emoji.length
  const open = count > 0 && dismissed !== text
  const index = Math.min(active, count - 1)

  const change = (next: string) => {
    setText(next)
    setActive(0)
  }
  const pick = (person: Person) => {
    change(`${text.slice(0, text.length - query!.length - 1)}@${person.name} `)
    area.current?.focus()
  }
  const pickEmoji = (index: number) => {
    change(`${text.slice(0, text.length - emojiQuery!.length - 1)}${pickSuggestion(emoji[index]!)}`)
    area.current?.focus()
  }
  /** Puts an emoji from the picker where the caret was, and the caret after it. */
  const insert = (value: string) => {
    const field = area.current
    const start = field?.selectionStart ?? text.length
    const end = field?.selectionEnd ?? text.length
    change(text.slice(0, start) + value + text.slice(end))
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + value.length, start + value.length)
    })
  }
  const attach = (list: ArrayLike<File>) => {
    if (list.length) setAttachments((current) => [...current, ...fromFiles(list)])
  }
  const remove = (id: string) => setAttachments((current) => current.filter((attachment) => attachment.id !== id))
  const send = () => {
    if (!canSend) return
    onSend?.({ text: text.trim(), snapshot, attachments: ready })
    if (onCancel) return
    change("")
    setSnapshot(false)
    setAttachments([])
  }
  useEffect(() => {
    if (!focusOnMount) return
    const field = area.current
    field?.focus()
    field?.setSelectionRange(field.value.length, field.value.length)
  }, [focusOnMount])
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault()
      setActive((index + (event.key === "ArrowDown" ? 1 : count - 1)) % count)
    } else if (open && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault()
      if (options.length) pick(options[index]!.person)
      else pickEmoji(index)
    } else if (open && event.key === "Escape") {
      event.preventDefault()
      setDismissed(text)
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      className={`relative rounded-xl border bg-background focus-within:border-ring ${className}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        attach(event.dataTransfer.files)
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-[oklch(0.65_0.18_250)] bg-[oklch(0.65_0.18_250/0.12)] text-xs font-medium motion-safe:animate-in motion-safe:fade-in-0">
          Drop to attach
        </div>
      )}
      {open && options.length > 0 && (
        <MentionMenu
          query={query}
          active={index}
          onPick={pick}
          className={`absolute left-2 z-20 ${menuSide === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        />
      )}
      {open && emoji.length > 0 && (
        <EmojiSuggest
          matches={emoji}
          active={index}
          onPick={(entry) => pickEmoji(emoji.indexOf(entry))}
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
        onPaste={(event) => {
          if (!event.clipboardData.files.length) return
          event.preventDefault()
          attach(event.clipboardData.files)
        }}
        className="max-h-40 min-h-0 resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-[13px] shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
      />
      {attachments.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 pt-1 pb-1">
          {pictures.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pictures.map((picture) => (
                <DraftPicture key={picture.id} attachment={picture} onRemove={() => remove(picture.id)} />
              ))}
            </div>
          )}
          {files.map((file) => (
            <AttachmentChip key={file.id} attachment={file} onRemove={() => remove(file.id)} />
          ))}
        </div>
      )}
      {snapshot && (
        <div className="px-3 pt-1 pb-1">
          <Snapshot frame={frame} onRemove={() => setSnapshot(false)} />
        </div>
      )}
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          attach(event.target.files ?? [])
          event.target.value = ""
        }}
      />
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
        <EmojiPopover onPick={insert}>
          <Button size="icon-xs" variant="ghost" aria-label="Add an emoji" className="text-muted-foreground">
            <SmilePlus />
          </Button>
        </EmojiPopover>
        {!onCancel && (
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
        )}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Attach files"
          className="text-muted-foreground"
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
        </Button>
        {onCancel ? (
          <span className="ml-auto flex gap-1">
            <Button size="xs" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="xs" disabled={!canSend} onClick={send}>
              Save
            </Button>
          </span>
        ) : (
          <Button
            size="icon-xs"
            className="ml-auto rounded-full"
            aria-label={uploading ? "Send, once the files finish uploading" : "Send"}
            disabled={!canSend}
            onClick={send}
          >
            <ArrowUp />
          </Button>
        )}
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

/**
 * Why a thread isn't where it was left, and the way back: move the pin of a thread whose layer was deleted, go to the
 * design a layer moved to, switch to the frame a comment was left in, or open the component it's on.
 */
export function PlaceNote({ place, layer }: { place: Place; layer?: string }) {
  const name = <span className="font-medium text-foreground">{layer ?? "Its layer"}</span>
  const strong = (text: string | number) => <span className="font-medium text-foreground">{text}</span>
  const {
    icon: Icon,
    text,
    action
  } = ((): { icon: LucideIcon; text: ReactNode; action: string } => {
    switch (place.kind) {
      case "deleted":
        return {
          icon: Unlink,
          text: (
            <>
              {name} was deleted by {nameOf(place.by)}, {place.when.toLowerCase()}. The pin stays where it was.
            </>
          ),
          action: "Move pin"
        }
      case "moved":
        return {
          icon: MoveRight,
          text: (
            <>
              Moved here with {name} from {strong(place.from)}, by {nameOf(place.by)}.
            </>
          ),
          action: "Show where"
        }
      case "frame":
        return {
          icon: MonitorSmartphone,
          text: <>Left on a different frame. You&apos;re looking at {strong(place.seen)}.</>,
          action: "Switch"
        }
      case "component":
        return {
          icon: Component,
          text: (
            <>
              On the {strong(place.component)} component, so it shows on all {place.uses} of its uses.
            </>
          ),
          action: "Open component"
        }
    }
  })()
  const deleted = place.kind === "deleted"
  return (
    <div
      className={`flex items-start gap-2 border-b py-2 pr-1.5 pl-3 text-xs text-muted-foreground ${deleted ? "bg-[oklch(0.8_0.14_75/0.1)]" : "bg-muted/40"}`}
    >
      <Icon className={`mt-px size-3.5 shrink-0 ${deleted ? "text-[oklch(0.82_0.14_75)]" : ""}`} />
      <span className="min-w-0 flex-1 leading-relaxed">{text}</span>
      <Button size="xs" variant="ghost" className="-my-0.5 text-foreground">
        {action}
      </Button>
    </div>
  )
}

function ThreadMenu({
  muted,
  issue,
  trackers,
  onMarkUnread,
  onCopyLink,
  onMute,
  onIssue,
  onUnlink,
  onDelete
}: {
  muted: boolean
  /** The key of the issue the thread became, if it has. */
  issue?: string
  trackers: Tracker[]
  onMarkUnread?: () => void
  onCopyLink?: () => void
  onMute: () => void
  onIssue: (tracker: TrackerId | undefined, mode: "create" | "link") => void
  onUnlink: () => void
  onDelete?: () => void
}) {
  // A dialog opened from the menu keeps focus; handing it back to the menu's button would close the dialog again.
  const leaving = useRef(false)
  const openIssue = (tracker: TrackerId | undefined, mode: "create" | "link") => {
    leaving.current = true
    onIssue(tracker, mode)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="More">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onCloseAutoFocus={(event) => {
          if (leaving.current) event.preventDefault()
          leaving.current = false
        }}
      >
        <DropdownMenuItem onSelect={onMarkUnread}>
          <Mail /> Mark as unread
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCopyLink}>
          <Link /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMute}>
          <BellOff /> {muted ? "Unmute this thread" : "Mute this thread"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {issue ? (
          <DropdownMenuItem onSelect={onUnlink}>
            <Unlink /> Unlink {issue}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SquareArrowOutUpRight /> Create issue
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {trackers.map((tracker) => (
                <DropdownMenuItem key={tracker.id} onSelect={() => openIssue(tracker.id, "create")}>
                  <TrackerMark id={tracker.id} size={14} /> In {tracker.name}
                </DropdownMenuItem>
              ))}
              {trackers.length > 0 ? (
                <DropdownMenuItem onSelect={() => openIssue(undefined, "link")}>
                  <Link2 /> Link an existing issue
                </DropdownMenuItem>
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Your org hasn&apos;t added an issue tracker yet.
                </p>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Plus /> Add an issue tracker
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete thread
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A thread, as it opens beside its pin: where it is, resolve and more, the comments (long threads fold their middle),
 * an agent at work when one was mentioned, and the reply box. Resolving folds the reply box away; Reopen brings it back.
 * With `onChange` the canvas holds the thread, so its pin can follow along; without it, the thread keeps its own.
 */
export function Thread({
  thread: given,
  onChange,
  onClose,
  onMarkUnread,
  onCopyLink,
  onDelete,
  trackers = orgTrackers,
  canApprove = true,
  className = ""
}: {
  thread: ThreadData
  onChange?: (thread: ThreadData) => void
  onClose?: () => void
  onMarkUnread?: () => void
  onCopyLink?: () => void
  onDelete?: () => void
  /** The issue trackers the org has added, which Create issue offers. */
  trackers?: Tracker[]
  /** You can edit, so you can approve what's proposed; someone who can only comment can't. */
  canApprove?: boolean
  className?: string
}) {
  const [own, setOwn] = useState(given)
  const [expanded, setExpanded] = useState(false)
  const [muted, setMuted] = useState(false)
  const [issueDialog, setIssueDialog] = useState<{ tracker: TrackerId; mode: "create" | "link"; opened: number }>()
  const thread = onChange ? given : own
  const update = (change: (current: ThreadData) => ThreadData) =>
    onChange ? onChange(change(thread)) : setOwn((current) => change(current))
  const resolve = () =>
    update((current) => ({ ...current, resolved: current.resolved ? undefined : { by: me, when: "Just now" } }))
  const react = (id: string, emoji: string) =>
    update((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === id ? { ...comment, reactions: toggleReaction(comment.reactions, emoji) } : comment
      )
    }))
  const reply = ({ text, snapshot, attachments }: Draft) =>
    update((current) => ({
      ...current,
      comments: [
        ...current.comments,
        {
          id: `${current.id}-${Date.now()}`,
          author: me,
          when: "Just now",
          text,
          snapshot: snapshot ? (current.frame ?? "Desktop") : undefined,
          attachments: attachments.length ? attachments : undefined
        }
      ]
    }))
  const edit = (id: string, { text, attachments }: Draft) =>
    update((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === id
          ? { ...comment, text, attachments: attachments.length ? attachments : undefined, edited: true }
          : comment
      )
    }))
  /** Approving a proposal sets whoever proposed it to work on it; declining tells them, with why when you said. */
  const decide = (id: string, status: "approved" | "declined", reason?: string) =>
    update((current) => {
      const proposing = current.comments.find((comment) => comment.id === id)
      if (!proposing?.proposal) return current
      return {
        ...current,
        working:
          status === "approved" ? { agent: proposing.author, label: proposing.proposal.summary } : current.working,
        comments: current.comments.map((comment) =>
          comment === proposing
            ? { ...comment, proposal: { ...proposing.proposal!, status, by: me, when: "Just now", reason } }
            : comment
        )
      }
    })
  /** Deleting the first comment deletes the thread. */
  const remove = (id: string) => {
    if (thread.comments[0]?.id !== id)
      update((current) => ({ ...current, comments: current.comments.filter((comment) => comment.id !== id) }))
    else if (onDelete) onDelete()
    else update((current) => ({ ...current, comments: [], resolved: undefined }))
  }
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
          {thread.frame && (
            <span className="truncate text-[11px] text-muted-foreground">
              {thread.place?.kind === "frame" ? `Left on ${thread.frame}` : thread.frame}
            </span>
          )}
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
            {muted && <BellOff aria-label="Muted" className="size-3.5 text-muted-foreground" />}
            <ThreadMenu
              muted={muted}
              issue={thread.issue?.key}
              trackers={trackers}
              onMarkUnread={onMarkUnread}
              onCopyLink={onCopyLink}
              onMute={() => setMuted(!muted)}
              onIssue={(tracker, mode) =>
                setIssueDialog({ tracker: tracker ?? trackers[0]!.id, mode, opened: Date.now() })
              }
              onUnlink={() => update((current) => ({ ...current, issue: undefined }))}
              onDelete={onDelete}
            />
          </>
        )}
        {onClose && (
          <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>
      {thread.issue && <IssueLink issue={thread.issue} resolved={!!thread.resolved} onResolve={resolve} />}
      {thread.place && !thread.resolved && <PlaceNote place={thread.place} layer={thread.layer} />}
      {issueDialog && (
        <IssueDialog
          key={issueDialog.opened}
          open
          onOpenChange={(next) => !next && setIssueDialog(undefined)}
          thread={thread}
          available={trackers}
          initial={issueDialog}
          onLink={(issue) => update((current) => ({ ...current, issue }))}
        />
      )}
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
              <Comment
                comment={comment}
                first={comment === thread.comments[0]}
                canApprove={canApprove}
                onReact={(emoji) => react(comment.id, emoji)}
                onEdit={(draft) => edit(comment.id, draft)}
                onDelete={() => remove(comment.id)}
                onDecide={(status, reason) => decide(comment.id, status, reason)}
              />
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
  const attached = thread.comments.reduce((count, comment) => count + (comment.attachments?.length ?? 0), 0)
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
        <span className="line-clamp-2 text-[13px] text-foreground/85">
          {first.text.replace(/\{([^}]+)\}/g, "$1") || "Attached files"}
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {thread.layer && (
            <span className="flex items-center gap-1">
              <Layers className="size-3" /> {thread.layer}
            </span>
          )}
          {replies > 0 && <span>{replies === 1 ? "1 reply" : `${replies} replies`}</span>}
          {attached > 0 && (
            <span className="flex items-center gap-1" title={`${attached} attached`}>
              <Paperclip className="size-3" /> {attached}
            </span>
          )}
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

const filters: { id: Filter; title: string; matches: (thread: ThreadData) => boolean }[] = [
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
