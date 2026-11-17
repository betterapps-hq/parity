import { ArrowUpRight } from "lucide-react"
import type { OfferedLibrary } from "./offeredLibraries.ts"

export function LibraryLinks({ links }: { links: OfferedLibrary["links"] }) {
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
