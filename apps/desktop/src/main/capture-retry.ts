/** How many times a capture is taken before its failure is let through: the first try and two more. */
const captureTries = 3

/**
 * `take`'s result, taken again after `repaint` when it fails with Chromium's `UnknownVizError`, up to `captureTries`
 * times in all. `capturePage` fails that way when the offscreen window's compositor has no frame to copy, as when it's
 * just been resized for a tall frame or the machine is busy, and works once the window has painted again (PAR-880). Any
 * other failure, and the last try's, is thrown as it was.
 */
export async function retryingCapture<Taken>(take: () => Promise<Taken>, repaint: () => Promise<void>): Promise<Taken> {
  for (let tries = 1; ; tries++) {
    try {
      return await take()
    } catch (error) {
      // Electron rejects with the Chromium error's name as the message.
      const noFrame = error instanceof Error && error.message === "UnknownVizError"

      if (tries >= captureTries || !noFrame) {
        throw error
      }
    }

    await repaint()
  }
}
