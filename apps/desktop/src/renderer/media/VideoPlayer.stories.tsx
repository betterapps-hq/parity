import { VideoLength, VideoPlayer, VideoPreview } from "@parity-app/media-player"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

/**
 * The video player PAR-841 puts where videos play: larger in the library browser, on a Media card, and as a preview on
 * a result tile while it's pointed at. Each story is the player alone, at the size its place gives it, around a
 * 12-second clip with a tone, served at `/images/` with the stories' pictures.
 */
const meta = {
  title: "Parity/Media/Video player",
  component: VideoPlayer,
  args: { src: "/images/sample-clip.mp4", poster: "/images/sample-clip.jpg", label: "Sample clip" }
} satisfies Meta<typeof VideoPlayer>

export default meta

type Story = StoryObj<typeof meta>

/** The player, once its video can play. */
async function player(canvasElement: HTMLElement) {
  const group = await within(canvasElement).findByRole("group", { name: "Sample clip" })
  const video = group.querySelector("video")

  if (!video) {
    throw new Error("The player has no video")
  }

  await waitFor(() => expect(video.readyState).toBeGreaterThanOrEqual(HTMLMediaElement.HAVE_CURRENT_DATA))

  return { group, video, controls: within(group) }
}

/**
 * As large as the library browser's larger view allows. Keys pressed in it stay in it, so the arrows that move through
 * the video don't also step to the next result.
 */
export const Larger: Story = {
  render: (args) => (
    <div className="flex h-screen justify-center bg-popover p-4">
      <VideoPlayer {...args} className="h-full max-w-[820px] flex-1" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const around = fn()
    document.addEventListener("keydown", around)
    const { video, controls } = await player(canvasElement)

    // It opens playing, without sound.
    await waitFor(() => expect(video.paused).toBe(false))
    await expect(video.muted).toBe(true)

    await userEvent.click(controls.getByRole("button", { name: "Pause" }))
    await expect(video.paused).toBe(true)

    // The scrubber moves through it, and says where it is.
    const scrubber = controls.getByRole("slider", { name: "Position in the video" })
    scrubber.focus()
    await userEvent.keyboard("{Home}{ArrowRight}")
    await waitFor(() => expect(video.currentTime).toBeCloseTo(5, 0))
    await expect(scrubber).toHaveAttribute("aria-valuetext", "5 seconds")
    await expect(controls.getByText("0:05 / 0:12")).toBeVisible()

    // Up turns a muted video up from silence; the slider turns it up or down too.
    await userEvent.keyboard("{ArrowUp}")
    await expect(video.muted).toBe(false)
    await expect(video.volume).toBeCloseTo(0.1)
    const volume = controls.getByRole("slider", { name: "Volume" })
    volume.focus()
    await userEvent.keyboard("{End}")
    await expect(volume).toHaveAttribute("aria-valuetext", "100%")

    await userEvent.click(controls.getByRole("button", { name: "Mute" }))
    await expect(video.muted).toBe(true)
    await expect(controls.getByRole("button", { name: "Full screen" })).toBeVisible()

    // Nothing around the player saw the keys it took.
    await expect(around).not.toHaveBeenCalled()
    document.removeEventListener("keydown", around)
  }
}

/**
 * As wide as a Media card, its controls smaller. The keys work once anything in the player has focus, clicking the
 * video among them. Pointing at Mute stands the volume's slider over it, and leaving puts it away, even after a
 * click in it.
 */
export const OnCard: Story = {
  args: { size: "sm" },
  render: (args) => (
    <div className="flex h-screen items-start justify-center bg-popover p-8">
      <VideoPlayer {...args} className="w-76" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { group, video, controls } = await player(canvasElement)
    await waitFor(() => expect(video.paused).toBe(false))

    // Clicking the video pauses it and puts the keys on the player.
    await userEvent.click(video)
    await expect(video.paused).toBe(true)
    await expect(group).toHaveFocus()

    await userEvent.keyboard(" ")
    await waitFor(() => expect(video.paused).toBe(false))
    await userEvent.keyboard("k")
    await expect(video.paused).toBe(true)

    await userEvent.keyboard("m")
    await expect(video.muted).toBe(false)
    await expect(controls.getByRole("button", { name: "Mute" })).toBeVisible()

    await userEvent.keyboard("{End}")
    await waitFor(() => expect(controls.getByText("0:12 / 0:12")).toBeVisible())

    // The volume's slider stands over Mute while the keyboard has focus in it. In it, Home and End turn the video up or
    // down rather than move it: all the way down mutes it.
    const volume = controls.getByRole("slider", { name: "Volume" })
    const stand = volume.closest<HTMLElement>(".absolute")
    await expect(stand && getComputedStyle(stand).opacity).toBe("0")
    volume.focus()
    await waitFor(() => expect(stand && getComputedStyle(stand).opacity).toBe("1"))
    await userEvent.keyboard("{Home}")
    await expect(video.muted).toBe(true)
    await expect(controls.getByRole("button", { name: "Unmute" })).toBeVisible()

    // Escape puts it away, back to Mute, and goes no further.
    const around = fn()
    document.addEventListener("keydown", around)
    await userEvent.keyboard("{Escape}")
    document.removeEventListener("keydown", around)
    await expect(controls.getByRole("button", { name: "Unmute" })).toHaveFocus()
    await waitFor(() => expect(stand && getComputedStyle(stand).opacity).toBe("0"))
    await expect(around).not.toHaveBeenCalled()
    await expect(controls.getByText("0:12 / 0:12")).toBeVisible()
  }
}

/**
 * A result tile's poster with how long the video runs in its corner, and the video playing over it while it's pointed
 * at, the time left counting down, as the library browser shows one.
 */
function PointedAt() {
  const [pointed, setPointed] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const point = (on: boolean) => {
    setPointed(on)
    setElapsed(0)
  }

  return (
    <div
      data-testid="tile"
      onPointerEnter={() => point(true)}
      onPointerLeave={() => point(false)}
      className="relative w-60 overflow-hidden rounded-lg border"
    >
      <img src="/images/sample-clip.jpg" alt="" className="block aspect-video w-full object-cover" />
      {pointed && (
        <VideoPreview
          src="/images/sample-clip.mp4"
          onTime={setElapsed}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <VideoLength seconds={12} elapsed={elapsed} />
    </div>
  )
}

/**
 * On a result tile: how long it runs, and while it's pointed at, the video playing without sound or controls and the
 * time left counting down.
 */
export const Preview: Story = {
  render: () => (
    <div className="flex h-screen items-start justify-center bg-popover p-8">
      <PointedAt />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tile = await within(canvasElement).findByTestId("tile")
    await expect(tile.querySelector("video")).toBeNull()
    await expect(within(tile).getByText("0:12")).toBeVisible()

    await userEvent.hover(tile)
    await waitFor(() => expect(tile.querySelector("video")?.paused).toBe(false))

    const video = tile.querySelector("video")
    await expect(video?.muted).toBe(true)
    await expect(video?.controls).toBe(false)
    await waitFor(() => expect(within(tile).getByText("0:10")).toBeVisible(), { timeout: 4000 })

    // Moving away shows its whole length again.
    await userEvent.unhover(tile)
    await expect(tile.querySelector("video")).toBeNull()
    await expect(within(tile).getByText("0:12")).toBeVisible()
  }
}
