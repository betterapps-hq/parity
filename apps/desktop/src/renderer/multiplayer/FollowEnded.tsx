import type { LucideIcon } from "lucide-react"
import { CanvasBanner } from "./CanvasBanner.tsx"

/** Where the banner was, once following ends: why it ended, briefly, on the same bar. */
export function FollowEnded({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return <CanvasBanner lead={<Icon className="size-4 text-muted-foreground" />} title={title} hint={hint} />
}
