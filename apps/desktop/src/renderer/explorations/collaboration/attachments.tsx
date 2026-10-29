import {
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
  TriangleAlert,
  X
} from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { accent, MiniScreen } from "../parts.tsx"
import type { Attachment } from "./collab-data.ts"

/** The largest file a comment takes. */
export const largestAttachment = 25_000_000

/** A size as people read it: 86 KB, 2.4 MB. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`
  return `${(bytes / 1_000_000).toFixed(1).replace(/\.0$/, "")} MB`
}

const kinds: { match: RegExp; label: string; icon: LucideIcon; hue: number }[] = [
  { match: /\.pdf$/i, label: "PDF", icon: FileText, hue: 25 },
  { match: /\.(docx?|pages|rtf|txt|md)$/i, label: "Document", icon: FileText, hue: 255 },
  { match: /\.csv$/i, label: "CSV", icon: FileSpreadsheet, hue: 150 },
  { match: /\.(xlsx?|numbers)$/i, label: "Spreadsheet", icon: FileSpreadsheet, hue: 150 },
  { match: /\.(zip|tar|gz|7z)$/i, label: "Archive", icon: FileArchive, hue: 80 },
  { match: /\.(mp4|mov|webm)$/i, label: "Video", icon: FileVideo, hue: 300 },
  { match: /\.(json|ts|tsx|js|jsx|css|html|svg)$/i, label: "Code", icon: FileCode, hue: 200 }
]

/** What kind of file a name is, for its chip. */
export function fileKind(name: string): { label: string; icon: LucideIcon; hue?: number } {
  const known = kinds.find((kind) => kind.match.test(name))
  if (known) return known
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]
  return { label: extension ? extension.toUpperCase() : "File", icon: File }
}

/** A file attached as a chip: its kind, name and size, then download, or remove while it's still a draft. */
export function AttachmentChip({
  attachment,
  onRemove,
  className = ""
}: {
  attachment: Attachment
  onRemove?(): void
  className?: string
}) {
  const kind = fileKind(attachment.name)
  const Icon = attachment.error ? TriangleAlert : kind.icon
  const color = attachment.error ? "oklch(0.72 0.17 30)" : kind.hue ? accent(kind.hue, 0.75, 0.13) : undefined
  const uploading = attachment.progress !== undefined
  return (
    <div
      className={`relative flex h-11 w-60 max-w-full items-center gap-2.5 overflow-hidden rounded-lg border bg-background/60 pr-1 pl-1.5 text-xs ${attachment.error ? "border-[oklch(0.72_0.17_30/0.45)]" : ""} ${className}`}
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
        style={color ? { color, background: `color-mix(in oklch, ${color} 14%, transparent)` } : undefined}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium" title={attachment.name}>
          {attachment.name}
        </span>
        <span className={`truncate ${attachment.error ? "text-[oklch(0.78_0.14_30)]" : "text-muted-foreground"}`}>
          {attachment.error ??
            (uploading
              ? `Uploading, ${Math.round(attachment.progress! * 100)}%`
              : `${kind.label}, ${formatSize(attachment.size)}`)}
        </span>
      </span>
      {onRemove ? (
        <Button size="icon-xs" variant="ghost" aria-label={`Remove ${attachment.name}`} onClick={onRemove}>
          <X />
        </Button>
      ) : (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Download ${attachment.name}`}
          className="text-muted-foreground"
        >
          <Download />
        </Button>
      )}
      {uploading && <Progress value={attachment.progress!} />}
    </div>
  )
}

function Progress({ value }: { value: number }) {
  return (
    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
      <span
        className="block h-full bg-[oklch(0.65_0.18_250)] transition-[width] duration-200 ease-out"
        style={{ width: `${Math.max(4, value * 100)}%` }}
      />
    </span>
  )
}

/** The picture itself: a file you attached, or a made-up screen for the explorations. */
function Picture({ attachment, className = "" }: { attachment: Attachment; className?: string }) {
  return (
    <span className={`relative block overflow-hidden bg-muted ${className}`}>
      {attachment.url ? (
        <img src={attachment.url} alt={attachment.name} className="absolute inset-0 size-full object-cover" />
      ) : attachment.screen ? (
        <MiniScreen {...attachment.screen} />
      ) : null}
    </span>
  )
}

/** A picture waiting to be sent: a small preview, a bar while it uploads, and remove. */
export function DraftPicture({ attachment, onRemove }: { attachment: Attachment; onRemove?(): void }) {
  const uploading = attachment.progress !== undefined
  return (
    <div className="group/picture relative size-16 shrink-0 overflow-hidden rounded-lg border">
      <Picture attachment={attachment} className={`size-full ${uploading ? "opacity-60" : ""}`} />
      {uploading && <Progress value={attachment.progress!} />}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          onClick={onRemove}
          className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/70 text-white opacity-0 ring-1 ring-white/20 group-hover/picture:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

/**
 * What a comment has attached: pictures first, as previews (one large, or a grid with the rest counted), then files as
 * chips. A picture opens larger, and the arrow keys step through the others.
 */
export function Attachments({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<number>()
  const pictures = items.filter((item) => item.kind === "image")
  const files = items.filter((item) => item.kind === "file")
  const shown = pictures.slice(0, 4)
  return (
    <div className="flex flex-col gap-1.5">
      {pictures.length > 0 && (
        <div className={`grid w-full max-w-[17rem] gap-1 ${pictures.length === 1 ? "" : "grid-cols-2"}`}>
          {shown.map((picture, index) => (
            <button
              key={picture.id}
              type="button"
              aria-label={`Open ${picture.name}`}
              onClick={() => setOpen(index)}
              className="group/open relative overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Picture
                attachment={picture}
                className={`${pictures.length === 1 ? "aspect-[16/10]" : "aspect-[4/3]"} w-full transition-[scale] duration-200 ease-out group-hover/open:scale-[1.03]`}
              />
              {index === 3 && pictures.length > 4 && (
                <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-medium text-white">
                  +{pictures.length - 4}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {files.map((file) => (
        <AttachmentChip key={file.id} attachment={file} />
      ))}
      <Lightbox pictures={pictures} index={open} onIndex={setOpen} />
    </div>
  )
}

/** A picture at full size, with its name, size and download, stepping through the comment's others. */
function Lightbox({
  pictures,
  index,
  onIndex
}: {
  pictures: Attachment[]
  index?: number
  onIndex(index: number | undefined): void
}) {
  const picture = index === undefined ? undefined : pictures[index]
  const step = (by: number) => index !== undefined && onIndex((index + by + pictures.length) % pictures.length)
  useEffect(() => {
    if (index === undefined || pictures.length < 2) return undefined
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowRight") onIndex((index + 1) % pictures.length)
      if (event.key === "ArrowLeft") onIndex((index - 1 + pictures.length) % pictures.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, pictures.length, onIndex])
  return (
    <Dialog open={!!picture} onOpenChange={(next) => !next && onIndex(undefined)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {picture && (
          <>
            <div className="relative bg-black">
              <Picture attachment={picture} className="aspect-[16/10] w-full" />
              {pictures.length > 1 && (
                <>
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Previous picture"
                    onClick={() => step(-1)}
                    className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full opacity-90"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Next picture"
                    onClick={() => step(1)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full opacity-90"
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 border-t px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <DialogTitle className="truncate text-sm font-medium">{picture.name}</DialogTitle>
                <DialogDescription className="text-xs">
                  {formatSize(picture.size)}
                  {pictures.length > 1 ? `, ${index! + 1} of ${pictures.length}` : ""}
                </DialogDescription>
              </span>
              <Button size="sm" variant="outline">
                <Download /> Download
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Turns files from a picker, a drop or a paste into attachments, refusing any over the limit. */
export function fromFiles(files: ArrayLike<File>): Attachment[] {
  return Array.from(files, (file) => {
    const image = file.type.startsWith("image/")
    const tooLarge = file.size > largestAttachment
    return {
      id: crypto.randomUUID(),
      name: file.name || (image ? "Pasted image.png" : "Untitled"),
      size: file.size,
      kind: image && !tooLarge ? "image" : "file",
      url: image && !tooLarge ? URL.createObjectURL(file) : undefined,
      progress: tooLarge ? undefined : 0,
      error: tooLarge ? `Too large, ${formatSize(largestAttachment)} at most` : undefined
    }
  })
}

/** Moves every upload along, as a stand-in for the real thing: a few steps a second until each is done. */
export function useUploads(
  attachments: Attachment[],
  setAttachments: (change: (current: Attachment[]) => Attachment[]) => void
) {
  const uploading = attachments.some((attachment) => attachment.progress !== undefined)
  useEffect(() => {
    if (!uploading) return undefined
    const timer = window.setInterval(() => {
      setAttachments((current) =>
        current.map((attachment) => {
          if (attachment.progress === undefined) return attachment
          const next = attachment.progress + 0.12 + Math.random() * 0.22
          return { ...attachment, progress: next >= 1 ? undefined : next }
        })
      )
    }, 220)
    return () => window.clearInterval(timer)
  }, [uploading, setAttachments])
  return uploading
}
