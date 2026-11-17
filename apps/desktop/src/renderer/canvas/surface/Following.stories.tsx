import { Button } from "@buildkitgg/shadcn"
import { type Camera, type CameraView, createCamera, type FollowEnd, type Following } from "@parity-app/editor"
import { FollowLayer, type FollowState } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useRef, useState } from "react"
import { type Editor, Tldraw, toRichText } from "tldraw"
import { members } from "../../multiplayer/story-kit.tsx"
import { createCanvasId } from "../tldraw-names.ts"
import { tldrawCameraPort } from "./camera-tldraw.ts"

/**
 * The canvas surface's camera following someone, on a real tldraw canvas (PAR-1236): the camera service glides to each
 * view Mia's copy sends, and its own moves never end it. Esc, a pan or a zoom of your own ends it, and so does Mia
 * leaving. The frame, banner and notes are the Follow mode stories', driven by the service's end reasons.
 */
const meta = {
  title: "Parity/Canvas/Following",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

/** Where Mia looks, one after another: each board in turn. */
const boards = [
  { x: 0, y: 0, w: 480, h: 320, text: "Dashboard" },
  { x: 900, y: 140, w: 360, h: 520, text: "Settings" },
  { x: 260, y: 820, w: 640, h: 300, text: "Pricing" },
  { x: 1500, y: -200, w: 300, h: 300, text: "Profile" }
]

const viewOfBoard = ({ x, y, w, h }: (typeof boards)[number]): CameraView => ({
  x: x - 60,
  y: y - 60,
  width: w + 120,
  height: h + 120
})

/** What following last did, as `follow.ended` said. */
function statusOf(ended: FollowEnd | undefined, state: FollowState): string {
  if (ended) {
    return `follow.ended: ${ended}`
  }

  return state === "following" ? "Following" : ""
}

/** How long the note that following ended stays: longer when Mia left, since you didn't do it. */
const noteMs = { stopped: 2000, left: 4000 }

function FollowingStory() {
  const [camera, setCamera] = useState<Camera>()
  const [state, setState] = useState<FollowState>("done")
  const [ended, setEnded] = useState<FollowEnd>()
  const following = useRef<Following>(undefined)
  const leaving = useRef(false)

  const mount = (editor: Editor) => {
    editor.createShapes(
      boards.map(({ text, ...box }, index) => ({
        id: createCanvasId(`board-${index}`),
        type: "geo",
        x: box.x,
        y: box.y,
        props: { geo: "rectangle", w: box.w, h: box.h, richText: toRichText(text) }
      }))
    )
    // The canvas in the toolbar's theme, which Storybook puts on the page as a class.
    editor.user.updateUserPreferences({
      colorScheme: document.documentElement.classList.contains("dark") ? "dark" : "light"
    })
    editor.zoomToFit()
    const service = createCamera(tldrawCameraPort(editor))
    setCamera(service)

    return () => service.dispose()
  }

  const follow = () => {
    if (!camera) {
      return
    }

    let at = 0
    const next = camera.follow(viewOfBoard(boards[at]!), { owner: "story" })
    following.current = next
    setState("following")
    setEnded(undefined)

    const timer = setInterval(() => {
      at = (at + 1) % boards.length
      next.update(viewOfBoard(boards[at]!))
    }, 2200)

    next.onEnd((why) => {
      clearInterval(timer)
      setEnded(why)
      setState(leaving.current ? "left" : "stopped")
      leaving.current = false
    })
  }

  useEffect(() => {
    if (state !== "stopped" && state !== "left") {
      return undefined
    }

    const timer = setTimeout(() => setState("done"), noteMs[state])

    return () => clearTimeout(timer)
  }, [state])

  const leave = () => {
    leaving.current = true
    following.current?.dispose()
  }

  return (
    <div className="flex h-screen flex-col gap-3 bg-background p-4 text-foreground">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={state === "following"} onClick={follow}>
          Follow Mia
        </Button>
        <Button size="sm" variant="outline" disabled={state !== "following"} onClick={leave}>
          Make Mia leave
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {statusOf(ended, state)}
        </span>
      </div>
      <div className="@container relative min-h-0 flex-1 overflow-hidden rounded-xl border">
        <Tldraw hideUi onMount={mount} />
        <FollowLayer leader={members.mia} state={state} onStop={() => following.current?.dispose()} />
      </div>
    </div>
  )
}

export const OnTheCanvas: StoryObj = { render: () => <FollowingStory /> }
