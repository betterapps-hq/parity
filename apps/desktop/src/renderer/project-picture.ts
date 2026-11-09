import type { PictureFrame, PictureScreen, ProjectPicture, RenderJob } from "../shared/protocol.ts"
import { bitmapsWaiting, type FrameShows, firstRowFrame, frameBitmap } from "./canvas/frame-bitmaps.ts"
import { request } from "./service.ts"
import { type PicturedScreen, picturedScreens } from "./start/picture-screens.ts"
import { keptPictures } from "./start/pictures.ts"
import type { ProjectSession } from "./workspace.ts"

/** How long after the project opens, or after a save, its picture is taken, so a run of saves takes one. */
const pictureDelayMs = 2000

/** How often it looks again whether the canvas has drawn the frames and has their bitmaps. */
const checkMs = 500

/** How long it waits for them at most, before taking what it can. */
const waitAtMostMs = 30_000

/** A pictured screen with what its frames show on the canvas. */
interface ScreenFrames {
  screen: PicturedScreen
  main?: FrameShows
  phone?: FrameShows
}

/**
 * Keeps a project's picture for the start page (PAR-607): taken a moment after the project opens and after each save,
 * from the bitmaps the canvas has of its first screens' frames, so Home shows the project as it was saved. Edits not
 * saved yet are never pictured: a picture that would show them waits for the next save. Stops when the function it
 * gives is called.
 */
export function keepProjectPicture(session: ProjectSession): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let taking = false
  let again = false

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(take, pictureDelayMs)
  }

  const take = () => {
    if (taking) {
      again = true

      return
    }

    taking = true
    void takePicture(session, () => stopped)
      .catch((error: unknown) => console.warn(`Couldn't keep ${session.info.name}'s picture`, error))
      .finally(() => {
        taking = false

        if (again && !stopped) {
          schedule()
        }

        again = false
      })
  }

  let status = session.store.getSaveState().status

  const unsubscribe = session.store.subscribe(() => {
    const next = session.store.getSaveState().status

    if (status === "saving" && next === "saved") {
      schedule()
    }

    status = next
  })

  schedule()

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
  }
}

async function takePicture(session: ProjectSession, stopped: () => boolean): Promise<void> {
  const screens = await framesDrawn(session, stopped)

  if (stopped() || session.store.hasUnsaved()) {
    return
  }

  const taken = await Promise.all(screens.map(screenPicture))

  // An edit made while the bitmaps were gathered may be in them.
  if (stopped() || session.store.hasUnsaved()) {
    return
  }

  const picture: ProjectPicture = {
    taken: Date.now(),
    screens: taken.filter((screen): screen is PictureScreen => screen !== undefined)
  }

  const { root } = session.info
  const kept = await request("pictures.store", { root, picture })
  keptPictures.set(root, kept)
}

/**
 * The screens to picture and what their frames show, once the canvas has drawn them all and has every frame's bitmap
 * it's waiting for, so the picture comes after the canvas's own; or what there is after waiting at most 30 seconds.
 */
async function framesDrawn(session: ProjectSession, stopped: () => boolean): Promise<ScreenFrames[]> {
  const started = performance.now()

  for (;;) {
    const screens = picturedScreens(session.store.getEntries(), session.store.getModes()).map(
      (screen): ScreenFrames => ({
        screen,
        main: firstRowFrame(session.id, screen.design, screen.main.id),
        ...(screen.phone ? { phone: firstRowFrame(session.id, screen.design, screen.phone.id) } : {})
      })
    )

    const drawn = screens.every(({ screen, main, phone }) => main && (!screen.phone || phone))

    if (stopped() || (drawn && bitmapsWaiting() === 0) || performance.now() - started > waitAtMostMs) {
      return screens
    }

    await new Promise((resolve) => setTimeout(resolve, checkMs))
  }
}

/** A screen's frames as its picture shows them; nothing when its main frame has no bitmap. */
async function screenPicture({ screen, main, phone }: ScreenFrames): Promise<PictureScreen | undefined> {
  const [mainSrc, phoneSrc] = await Promise.all([main && frameBitmap(main), phone && frameBitmap(phone)])

  if (!main || !mainSrc) {
    return undefined
  }

  return {
    name: screen.name,
    main: pictureFrame(mainSrc, screen.main.name, main.job),
    ...(screen.phone && phone && phoneSrc ? { phone: pictureFrame(phoneSrc, screen.phone.name, phone.job) } : {})
  }
}

/** A frame in a picture, which shows the top of it, as tall as its window or its own height when that's less. */
function pictureFrame(src: string, mode: string, job: RenderJob): PictureFrame {
  const { width, height, viewport } = job.mode

  return { src, mode, width, height: Math.min(height ?? viewport.height, viewport.height) }
}
