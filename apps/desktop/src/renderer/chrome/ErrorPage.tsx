import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Check, Copy, TriangleAlert } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"

/**
 * All of a tab that failed, such as a project that couldn't open or one whose window stopped working: a mark, what
 * went wrong, a line under it, the error in full to read or copy, and the buttons. The buttons sit at the right, the
 * main one last, as in a dialog's footer (PAR-1011).
 */
export function ErrorPage({
  title,
  subtitle,
  details,
  actions,
  hidden,
  className
}: {
  title: string
  subtitle?: ReactNode
  details?: string
  actions: ReactNode
  hidden?: boolean
  className?: string
}) {
  return (
    <div hidden={hidden} className={`flex min-h-0 flex-1 overflow-y-auto p-6 ${className ?? ""}`}>
      <div role="alert" className="m-auto flex w-full max-w-2xl flex-col gap-5">
        <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle}
        </div>
        {details && <ErrorDetails message={details} />}
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  )
}

/** The error as it was given, to read in full or copy into a bug report. */
function ErrorDetails({ message }: { message: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) {
      return
    }

    const timer = setTimeout(() => setCopied(false), 1500)

    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b py-1 pr-1 pl-3 text-xs text-muted-foreground">
        Details
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => void navigator.clipboard.writeText(message).then(() => setCopied(true))}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-56 overflow-auto p-3 type-code font-mono whitespace-pre-wrap text-foreground/90 select-text">
        {message}
      </pre>
    </div>
  )
}
