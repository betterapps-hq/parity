/*
 * Fonts for Storybook, which loads no project and lists no computer's fonts: four the stand-in project's font tokens
 * name, Geist as the app's own sans, and fonts installed on Windows, so each draws in its own face.
 */
import type { FontFamily } from "./text-data.ts"

/** The stand-in project's fonts, which its font tokens name: Geist, as the app's own sans, and three more. */
export const standInProjectFonts: FontFamily[] = [
  {
    name: "Geist",
    stack: '"Geist Variable", sans-serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    axis: [100, 900],
    italic: false
  },
  { name: "Georgia", stack: "Georgia, serif", weights: [400, 700], italic: true },
  { name: "Consolas", stack: "Consolas, monospace", weights: [400, 700], italic: true },
  { name: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif', weights: [400, 700], italic: true }
]

/** Fonts installed on Windows, standing in for the computer's. */
export const standInInstalledFonts: FontFamily[] = [
  { name: "Segoe UI", stack: '"Segoe UI", sans-serif', weights: [300, 400, 600, 700], italic: true },
  { name: "Arial", stack: "Arial, sans-serif", weights: [400, 700], italic: true },
  { name: "Verdana", stack: "Verdana, sans-serif", weights: [400, 700], italic: true },
  { name: "Palatino Linotype", stack: '"Palatino Linotype", serif', weights: [400, 700], italic: true },
  { name: "Times New Roman", stack: '"Times New Roman", serif', weights: [400, 700], italic: true },
  { name: "Courier New", stack: '"Courier New", monospace', weights: [400, 700], italic: true },
  { name: "Impact", stack: "Impact, sans-serif", weights: [400], italic: false }
]
