import { Check, Copy, X } from "lucide-react"
import { type ReactElement, type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** How long a copy says how it went, in milliseconds. */
const settles = 1500

/** How the last copy went, while it's still being shown. */
export interface CopyStatus {
  text: string
  /** False when the clipboard refused, as it does when the window isn't focused. */
  ok: boolean
}

/**
 * Copies text to the clipboard, and keeps how it went for a moment so what copied can say so. One status can serve
 * several ways of copying the same thing, such as a row's copy button and Ctrl+C on the row, so both show the result
 * in the same place.
 */
export function useCopy(): { status: CopyStatus | undefined; copy(text: string): void } {
  const [status, setStatus] = useState<CopyStatus>()
  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(undefined), settles)
    return () => clearTimeout(timer)
  }, [status])
  const copy = (text: string) => void write(text).then((ok) => setStatus({ text, ok }))
  return { status, copy }
}

/**
 * Writes text to the clipboard, saying whether it could. Where the Clipboard API refuses, as in a frame that doesn't
 * have focus (Storybook in a panel, say), it copies from a hidden field instead, which browsers still allow from a
 * click.
 */
async function write(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement("textarea")
    field.value = text
    field.readOnly = true
    field.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0"
    // The field goes beside what has focus, so focus stays inside the popover or menu that's open, which would close if
    // focus left it.
    const focused = document.activeElement
    const beside = focused instanceof HTMLElement && focused.parentElement ? focused.parentElement : document.body
    beside.append(field)
    field.select()
    try {
      return document.execCommand("copy")
    } finally {
      field.remove()
      if (focused instanceof HTMLElement) focused.focus()
    }
  }
}

/** What a copy says once it's done, in a tooltip or bubble. */
function Outcome({ status, text }: { status: CopyStatus; text?: string }) {
  if (!status.ok) {
    return (
      <>
        <X className="size-3.5" /> Couldn't copy
      </>
    )
  }
  // When something else copied through the same status, such as a menu beside the button, it says what.
  return (
    <>
      <Check className="size-3.5" /> {status.text === text ? "Copied" : `Copied ${status.text}`}
    </>
  )
}

/**
 * A copy button. Its icon turns into a green check when the text is copied, or a red cross when the clipboard
 * refuses, then back, and its tooltip says which. Pass `copying` to share the status with another way of copying the
 * same thing, such as Ctrl+C, so this button shows that result too.
 */
export function CopyButton({
  text,
  label = `Copy ${text}`,
  copying,
  className
}: {
  text: string
  /** What the tooltip and screen readers call it. */
  label?: string
  copying?: ReturnType<typeof useCopy>
  className?: string
}) {
  const own = useCopy()
  const { status, copy } = copying ?? own
  const [hovered, setHovered] = useState(false)
  const done = status !== undefined
  return (
    <Tooltip open={hovered || done} onOpenChange={setHovered}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          data-copied={done ? (status.ok ? "copied" : "failed") : undefined}
          className={className}
          onClick={() => copy(text)}
        >
          <span className="grid place-items-center *:col-start-1 *:row-start-1 *:transition-[opacity,scale] motion-reduce:*:transition-none">
            <Copy className={`duration-150 ${done ? "scale-50 opacity-0" : ""}`} />
            {/* The check springs in a little past full size, so the change catches the eye. */}
            <Check
              className={`text-(--process-running) duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${done && status.ok ? "" : "scale-50 opacity-0"}`}
            />
            <X
              className={`text-destructive duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${done && !status.ok ? "" : "scale-50 opacity-0"}`}
            />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{done ? <Outcome status={status} text={text} /> : label}</TooltipContent>
      <Announce status={status} />
    </Tooltip>
  )
}

/** Says how a copy went to screen readers, which a tooltip doesn't reliably do. */
function Announce({ status }: { status: CopyStatus | undefined }) {
  return <output className="sr-only">{status ? (status.ok ? "Copied" : "Couldn't copy") : ""}</output>
}

/**
 * Makes an element copy `text` when clicked, for things with no room for a copy button, such as a swatch. A bubble
 * rises from the element to say it copied, since nothing else on screen changes. `hint` is what its tooltip says
 * before then, with `detail` dimmed below.
 */
export function CopyOnClick({
  text,
  hint,
  detail,
  side,
  children
}: {
  text: string
  hint?: ReactNode
  detail?: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  children: ReactElement
}) {
  const { status, copy } = useCopy()
  const [hovered, setHovered] = useState(false)
  const says = status !== undefined || hint !== undefined
  return (
    <Tooltip open={says && (hovered || status !== undefined)} onOpenChange={setHovered}>
      <TooltipTrigger asChild onClick={() => copy(text)}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={!status && detail ? "flex-col items-start gap-0.5" : undefined}>
        {status ? (
          <Outcome status={status} text={text} />
        ) : (
          <>
            {hint}
            {detail && <span className="text-background/70">{detail}</span>}
          </>
        )}
      </TooltipContent>
      <Announce status={status} />
    </Tooltip>
  )
}
