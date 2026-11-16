import { z } from "zod"

/**
 * What a frame read when it was drawn (PAR-994): each project file, relative to the project's root, with 16 hex digits
 * of the SHA-256 of its contents, or `-` for one that couldn't be read; the digest of them all with what drew them; and
 * which of the files each component the frame draws reads (PAR-997). A file no component reads, such as a stylesheet, a
 * tool's config or a lockfile, is one every node in the frame reads. The service takes traces; this package compares
 * them.
 */
export const frameTrace = z.object({
  files: z.record(z.string(), z.string().regex(/^(?:[0-9a-f]{16}|-)$/, "expected a file hash")),
  digest: z.string().regex(/^[0-9a-f]{40}$/, "expected a trace digest"),
  components: z.record(z.string(), z.array(z.string())).optional()
})

export type FrameTrace = z.infer<typeof frameTrace>
