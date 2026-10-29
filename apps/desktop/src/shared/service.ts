import type { ConsoleEntry, RenderedFrame, RenderJob } from "./protocol.ts"

/** Messages from the main process to the project service. */
export type MainMessage =
  | { type: "connect" }
  | { type: "render-result"; id: number; frame?: RenderedFrame; png?: string; error?: string }
  | { type: "console-result"; id: number; entries: ConsoleEntry[] }

/** Messages from the project service to the main process. */
export type ServiceMessage =
  | { type: "render"; id: number; job: RenderJob; capture: boolean }
  /** Reads what code from a project's builder at `origin` wrote to the console. */
  | { type: "console"; id: number; origin: string; clear: boolean }
