import { useProject } from "../canvas/context.ts"
import { useComponentPreview } from "../component-previews.ts"

/**
 * A component's preview as a plain image: the large picture at half its pixels, so it's sharp on a 2x screen. One made
 * for older code shows dimmed and says it's updating until the new one is made; one that fails to draw says why;
 * nothing shows while the first is waiting its turn (PAR-207).
 */
export function PreviewPicture({ component }: { component: string }) {
  const session = useProject()
  const preview = useComponentPreview(session.id, component)
  if (!preview) return null
  if (preview.state === "failed") {
    return <span className="text-background/70">Its preview fails to draw: {preview.error}</span>
  }
  const image = preview.state === "made" ? preview.image : preview.last
  if (!image) return null
  return (
    <span className="mb-1 flex flex-col items-start gap-0.5">
      <img
        src={image.large}
        alt=""
        width={image.width / 2}
        height={image.height / 2}
        decoding="async"
        className={`max-w-76 rounded-sm ${preview.state === "made" ? "" : "opacity-50"}`}
      />
      {preview.state !== "made" && <span className="text-background/70">Updating its preview</span>}
    </span>
  )
}
