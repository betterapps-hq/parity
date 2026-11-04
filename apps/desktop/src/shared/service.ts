import type { ConsoleEntry, RenderedFrame, RenderJob } from "./protocol.ts"

/** Messages from the main process to the project service. */
export type MainMessage =
  | { type: "connect" }
  | { type: "render-result"; id: number; frame?: RenderedFrame; png?: string; error?: string }
  /**
   * A component preview's pictures, base64 PNGs, and the large one's size; or `error`, why its component couldn't be
   * drawn; or `failed`, why the offscreen window couldn't finish it, which a later try may not hit.
   */
  | {
      type: "preview-result"
      id: number
      pictures?: { thumb: string; large: string; width: number; height: number }
      error?: string
      failed?: string
    }
  | { type: "console-result"; id: number; entries: ConsoleEntry[] }
  /** Asks for each builder's CPU and memory, for the performance stats: builders run in processes of their own. */
  | { type: "builders"; id: number }

/** Messages from the project service to the main process. */
export type ServiceMessage =
  | { type: "render"; id: number; job: RenderJob; capture: boolean }
  /**
   * Draws a component preview offscreen, after every canvas and agent job waiting, and crops it to the element `crop`
   * names (PAR-207).
   */
  | { type: "preview"; id: number; job: RenderJob; crop: string; priority: "visible" | "idle" }
  /** Reads what code from a project's builder at `origin` wrote to the console. */
  | { type: "console"; id: number; origin: string; clear: boolean }
  | { type: "builders-result"; id: number; builders: BuilderReading[] }

/** A project's builder process, as the performance stats show it. */
export interface BuilderReading {
  pid: number
  /** What it serves, as "Vite for shop". */
  name: string
  /** Share of the whole computer's CPU since the last reading, from 0 to 100. */
  cpu: number
  /** Its resident memory, in bytes, where the system's own reading isn't to be had. */
  memory: number
}
