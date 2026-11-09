import { type ContainerSpec, deviceForWidth, type ModeSettings, type ResolvedMode } from "@parity-app/core"
import { containerModes } from "../canvas/view.ts"

/** How many screens a project's picture holds: the ones its card flips through. */
export const picturedScreenCount = 5

/** A screen a project's picture shows: its design, its name, and the modes of its main frame and phone frame. */
export interface PicturedScreen {
  design: string
  name: string
  main: ResolvedMode
  /** The phone frame beside the main one, where the board shows one. */
  phone?: ResolvedMode
}

/**
 * The screens a project's picture shows, in order (PAR-607): first those whose boards show a phone frame beside the
 * main one, as the picture puts the two side by side, then the rest, each in Layers' order. Components and frames
 * aren't pictured.
 */
export function picturedScreens(
  designs: readonly { key: string; container: ContainerSpec }[],
  settings: ModeSettings,
  most = picturedScreenCount
): PicturedScreen[] {
  const screens = designs.flatMap(({ key, container }) => {
    if ((container.kind ?? "screen") !== "screen") {
      return []
    }

    const { primary, companions } = containerModes(settings, container)
    const phone = isPhone(primary) ? undefined : companions.find(isPhone)
    const screen: PicturedScreen = { design: key, name: container.name, main: primary }

    if (phone) {
      screen.phone = phone
    }

    return [screen]
  })

  return [...screens.filter(({ phone }) => phone), ...screens.filter(({ phone }) => !phone)].slice(0, most)
}

/** Whether a mode draws a phone's screen: its viewport says so, or else its width suggests it. */
export function isPhone(mode: ResolvedMode): boolean {
  const option = mode.options.find(({ variable }) => variable.kind === "viewport")?.option

  return (option?.device ?? deviceForWidth(mode.width)) === "phone"
}
