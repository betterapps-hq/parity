import type { ReactNode } from "react"
import type { PictureFrame, PictureScreen, ProjectPicture } from "../../shared/protocol.ts"
import { usePicture } from "./pictures.ts"
import { type KnownProject, projectHue } from "./projects.ts"

/** Width over height of a project's picture, as the canvas's boards are laid out in it. */
const artRatio = 16 / 10

/**
 * A project's picture (PAR-607): one of its screens as the canvas last drew it once saved, its main frame with the
 * phone frame beside it where its board shows one, on a backdrop in a color of the project's own. `screen` picks which;
 * `labels` names the frames above them, as the canvas does. Until a picture is kept, as for a project not opened since,
 * a placeholder stands in: a desktop board and a phone with the project's initial.
 */
export function ProjectArt({
  project,
  screen = 0,
  labels = false,
  fallback
}: {
  project: KnownProject
  screen?: number
  labels?: boolean
  /** A picture to show until the project's own is kept, as the example has. */
  fallback?: ProjectPicture | undefined
}) {
  const picture = usePicture(project.root) ?? fallback
  const shown = picture?.screens[screen] ?? picture?.screens[0]
  return (
    <Backdrop hue={projectHue(project.root)}>
      {shown ? <ScreenArt screen={shown} labels={labels} /> : <Placeholder project={project} />}
    </Backdrop>
  )
}

/** How many screens a project's picture flips through: none until it's kept. */
export function useScreenCount(project: KnownProject): number {
  return usePicture(project.root)?.screens.length ?? 0
}

/** The name of a screen in a project's picture. */
export function useScreenName(project: KnownProject, screen: number): string | undefined {
  return usePicture(project.root)?.screens[screen]?.name
}

function Backdrop({ hue, children }: { hue: number; children: ReactNode }) {
  return (
    <div aria-hidden className="relative aspect-[16/10] overflow-hidden bg-muted/70" style={{ containerType: "size" }}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 60% at 30% 25%, oklch(0.6 0.14 ${hue} / 0.22), transparent 70%), radial-gradient(50% 50% at 90% 100%, oklch(0.6 0.12 ${hue + 60} / 0.14), transparent 70%)`
        }}
      />
      {children}
    </div>
  )
}

/**
 * A phone frame's drop shadow, which lifts it off the main frame it overlaps: a tight one where it meets the screen
 * below and a soft one further out, in shares of the picture's width so it's the same at every size.
 */
const phoneShadow =
  "shadow-[0_0.4cqw_1cqw_rgb(0_0_0/0.12),0_2cqw_5cqw_-1cqw_rgb(0_0_0/0.3)] dark:shadow-[0_0.4cqw_1cqw_rgb(0_0_0/0.4),0_2cqw_5cqw_-1cqw_rgb(0_0_0/0.65)]"

/** Where a frame goes in the picture, as shares of its width and height: the box it may fill, and whether it's a phone. */
interface Slot {
  left: number
  top: number
  width: number
  height: number
  phone?: boolean
}

/**
 * A screen's frames laid out as the canvas lays out a board: the main frame large and the phone frame to its right,
 * each the shape of its window and as large as its box allows. A main frame that's a phone itself stands alone in the
 * middle.
 */
function ScreenArt({ screen, labels }: { screen: PictureScreen; labels: boolean }) {
  const { main, phone } = screen
  const top = labels ? 0.15 : 0.08
  const height = 0.92 - top
  return (
    <>
      <Frame frame={main} slot={mainSlot(screen, top, height, labels)} label={labels ? screen.name : undefined} />
      {phone && (
        <Frame
          frame={phone}
          slot={{ left: labels ? 0.76 : 0.75, top: top + 0.1, width: 0.19, height: height - 0.06, phone: true }}
          label={labels ? phone.mode : undefined}
        />
      )}
    </>
  )
}

/**
 * The main frame's slot: beside the phone frame, else across the picture, or in the middle where it's a phone itself.
 * Where frames are named, the phone stands clear of the main frame, so its name reads on the backdrop.
 */
function mainSlot({ main, phone }: PictureScreen, top: number, height: number, labels: boolean): Slot {
  if (phone) return { left: labels ? 0.05 : 0.06, top, width: labels ? 0.66 : 0.71, height }
  if (main.width < 600) return { left: 0.3, top, width: 0.4, height, phone: true }
  return { left: 0.08, top, width: 0.84, height }
}

/**
 * One frame's bitmap, centered in its slot and as large as it allows. It shows the top of the frame, down to the bottom
 * of its window, or less where the frame is shorter, as the canvas draws one that grows with its content.
 */
function Frame({ frame, slot, label }: { frame: PictureFrame; slot: Slot; label?: string | undefined }) {
  const ratio = frame.width / frame.height
  // The share of the picture's width it takes: its slot's width, or less where its slot's height holds it back.
  const width = Math.min(slot.width, (slot.height / artRatio) * ratio)
  return (
    <div
      className="absolute"
      style={{
        left: `${(slot.left + (slot.width - width) / 2) * 100}%`,
        top: `${slot.top * 100}%`,
        width: `${width * 100}%`
      }}
    >
      {label && (
        <span className="absolute bottom-full left-0 mb-1 max-w-full truncate text-[11px] leading-none font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <div
        className={`overflow-hidden bg-background ring-1 ring-neutral-500/60 ${slot.phone ? `rounded-[7px] ${phoneShadow}` : "rounded-[5px] shadow-lg"}`}
        // Its window's height, as a share of the picture's, which is a size container.
        style={{ maxHeight: `${((width * artRatio) / ratio) * 100}cqh` }}
      >
        <img src={frame.src} alt="" draggable={false} className="block w-full" />
      </div>
    </div>
  )
}

/** A project's picture before one is kept: a desktop board with a phone beside it, with its initial. */
function Placeholder({ project }: { project: KnownProject }) {
  const hue = projectHue(project.root)
  const ink = `oklch(0.66 0.15 ${hue})`
  const initial = /[\p{L}\p{N}]/u.exec(project.name)?.[0]?.toUpperCase() ?? "?"
  return (
    <>
      <div className="absolute top-[13%] left-[7%] flex aspect-[16/10] w-[66%] flex-col overflow-hidden rounded-[5px] bg-background shadow-lg ring-1 ring-neutral-500/60">
        <span className="flex h-[12%] shrink-0 items-center gap-[3%] border-b px-[4%]">
          <span className="aspect-square h-2/5 rounded-full" style={{ background: ink }} />
          <span className="h-1/4 w-1/4 rounded-full bg-muted" />
        </span>
        <span
          className="grid flex-1 place-items-center font-semibold"
          style={{ color: ink, containerType: "size", fontSize: "min(40cqh, 2.5rem)" }}
        >
          {initial}
        </span>
      </div>
      <div
        className={`absolute top-[24%] right-[8%] flex aspect-[9/19] w-[16%] flex-col overflow-hidden rounded-[6px] bg-background ring-1 ring-neutral-500/60 ${phoneShadow}`}
      >
        <span className="h-[8%] shrink-0 border-b" />
        <span className="m-[14%] h-[6%] rounded-full" style={{ background: ink }} />
      </div>
    </>
  )
}
