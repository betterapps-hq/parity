/*
 * The fonts the text fields list: the project's own, which its stylesheets declare with `@font-face`, then the fonts
 * installed on this computer, which the browser's Local Font Access lists. Each is a family with the weights it has a
 * face for, a variable font's weight axis, and whether it has italics.
 */
import { useSyncExternalStore } from "react"
import { type DeclaredFace, declaredFaces } from "../../guest.ts"
import { type FontFamily, stackFamilies } from "./text-data.ts"

/** A face Local Font Access lists: its family and its style's name (`Semibold Italic`). */
export interface LocalFace {
  family: string
  style: string
}

/** The weight each style name stands for, as fonts name their faces; anything else is Regular. */
const styleWeights: [RegExp, number][] = [
  [/thin|hairline/, 100],
  [/(extra|ultra)[\s-]?light/, 200],
  [/light/, 300],
  [/medium/, 500],
  [/(semi|demi)[\s-]?bold/, 600],
  [/(extra|ultra)[\s-]?bold/, 800],
  [/black|heavy/, 900],
  [/bold/, 700]
]

/** A face's weight from its style's name: `Semibold Italic` is 600. */
export function styleWeight(style: string): number {
  const name = style.toLowerCase()

  return styleWeights.find(([pattern]) => pattern.test(name))?.[1] ?? 400
}

const italicStyle = /italic|oblique/i

/** A family's stack as the fields write it: the family, quoted where it has to be, and a fallback. */
const familyStack = (family: string) => `${/^[a-z-]+$/i.test(family) ? family : JSON.stringify(family)}, sans-serif`

/** Faces grouped into families, in the order they first appear, each with its weights in order. */
function families(faces: readonly { family: string; weights: number[]; axis?: [number, number]; italic: boolean }[]) {
  const found = new Map<string, FontFamily>()

  for (const face of faces) {
    const family = found.get(face.family) ?? {
      name: face.family,
      stack: familyStack(face.family),
      weights: [],
      italic: false
    }

    family.weights = [...new Set([...family.weights, ...face.weights])].sort((a, b) => a - b)
    family.italic ||= face.italic
    family.axis ??= face.axis
    found.set(face.family, family)
  }

  return [...found.values()]
}

/** A declared weight's number: `bold` is 700, anything it can't read Regular. */
const weightNumber = (weight: string) => ({ bold: 700, normal: 400 })[weight] ?? (Number(weight) || 400)

/**
 * The families a project's `@font-face` rules declare. A face with a weight range is a variable font, with every
 * hundred in its range and that range as its axis.
 */
export function declaredFamilies(faces: readonly DeclaredFace[]): FontFamily[] {
  return families(
    faces.map((face) => {
      const [low = 400, high = low] = face.weight.trim().split(/\s+/).filter(Boolean).map(weightNumber)
      const variable = high > low
      const weights = variable ? hundredsBetween(low, high) : [low]

      return {
        family: stackFamilies(face.family)[0] ?? face.family,
        weights,
        axis: variable ? [low, high] : undefined,
        italic: italicStyle.test(face.style)
      }
    })
  )
}

/** Every hundred from one weight to another, both included where they're hundreds. */
function hundredsBetween(low: number, high: number): number[] {
  const weights: number[] = []

  for (let weight = Math.ceil(low / 100) * 100; weight <= high; weight += 100) {
    weights.push(weight)
  }

  return weights
}

/** The families Local Font Access lists, from each face's style name, alphabetically. */
export function installedFamilies(faces: readonly LocalFace[]): FontFamily[] {
  return families(
    faces.map((face) => ({
      family: face.family,
      weights: [styleWeight(face.style)],
      italic: italicStyle.test(face.style)
    }))
  ).toSorted((a, b) => a.name.localeCompare(b.name))
}

let installed: FontFamily[] | undefined
let asked = false
const listeners = new Set<() => void>()

/** The project's own fonts, from the loaded project's stylesheets, as they are now. */
export function projectFonts(): FontFamily[] {
  return declaredFamilies(declaredFaces())
}

/**
 * Asks for the computer's fonts, the first time anything wants them; what wants them draws again when they come. A
 * browser that lists them only after a click or a key, as Chrome does, gives none at first, so they're asked for
 * again on the next one (`FontFamilyField`). Electron lists them straight away.
 */
export function askForInstalledFonts(): void {
  if (asked) {
    return
  }

  asked = true

  // Local Font Access may be missing or refused; then no installed fonts are listed.
  void Promise.resolve(window.queryLocalFonts?.() ?? [])
    .then((faces) => installedFamilies(faces))
    .catch(() => [])
    .then((found) => {
      installed = found
      asked = found.length > 0
      listeners.forEach((listener) => listener())
    })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  askForInstalledFonts()

  return () => listeners.delete(listener)
}

const none: FontFamily[] = []

/** The fonts installed on this computer, asked for the first time it's used; none until they come. */
export function useInstalledFonts(): FontFamily[] {
  return useSyncExternalStore(subscribe, () => installed ?? none)
}

/** A font by its first family's name, ignoring case and quotes: the project's first, then the computer's. */
export function findFont(name: string): FontFamily | undefined {
  const bare = (stackFamilies(name)[0] ?? name).toLowerCase()

  return [...projectFonts(), ...(installed ?? [])].find((font) =>
    [font.name, stackFamilies(font.stack)[0]].some((family) => family?.toLowerCase() === bare)
  )
}
