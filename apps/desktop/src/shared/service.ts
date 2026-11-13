import type { AgentReport, ReportSent } from "@parity-app/agent"
import type { Found, SearchAnswer } from "@parity-app/connectors"
import type { ConnectorFind, ConnectorPlaced } from "./connectors.ts"
import type { ConsoleEntry, RenderedFrame, RenderJob } from "./protocol.ts"

/** Messages from the main process to the project service that aren't requests: a window's port to the service. */
export type ConnectMessage = { type: "connect" }

/** A component preview's pictures, base64 PNGs, with the large one's size. */
export interface PreviewPictures {
  thumb: string
  large: string
  width: number
  height: number
}

/** What drawing a preview gave: its pictures, nothing to see (PAR-517), or why its component didn't draw. */
export type PreviewDrawn = { pictures: PreviewPictures } | { empty: true } | { error: string }

/** Requests the project service sends to the main process, which owns the offscreen windows and every console. */
export interface MainMethods {
  /**
   * Draws a frame in one of the offscreen render windows and measures it, optionally capturing a PNG. No frame when it
   * didn't render.
   */
  render: { params: { job: RenderJob; capture: boolean }; result: { frame?: RenderedFrame; png?: string } }
  /**
   * Draws a component preview offscreen, after every canvas and agent job waiting, and crops it to the element `crop`
   * names (PAR-207). Gives its pictures; or `empty`, when its picture showed nothing but the page (PAR-517); or
   * `error`, why its component couldn't be drawn. It fails when the offscreen window couldn't finish it, which a later
   * try may not hit.
   */
  preview: {
    params: { job: RenderJob; crop: string; priority: "visible" | "idle" }
    result: PreviewDrawn
  }
  /** What code from a project's builder at `origin` wrote to the console, forgotten once read when `clear` is set. */
  console: { params: { origin: string; clear: boolean }; result: ConsoleEntry[] }
  /**
   * A link another copy of Parity got from the browser, which it passes on through this copy's local service: taken
   * when it's the sign-in this copy is waiting for (PAR-612).
   */
  signInLink: { params: { link: string }; result: { taken: boolean } }
  /**
   * Finds what an agent asked for, from the connector it names or the first that finds that kind, takes its filters and
   * has a key (PAR-829). Main holds the keys, so every search runs there.
   */
  connectorFind: { params: ConnectorFind; result: SearchAnswer }
  /**
   * Main's own copy of a result it gave lately, which an agent's `place_result` puts in a design: null for one it didn't
   * give, or gave too long ago.
   */
  connectorResult: { params: { connector: string; id: string }; result: (Found & { placeable: boolean }) | null }
  /** An agent placed a result in a design, which main records and tells the source of. */
  connectorPlaced: { params: ConnectorPlaced; result: undefined }
  /**
   * An event or span the service or its worker recorded, for the local copy and Sentry (PAR-627). Main checks it, since
   * it's sent as data.
   */
  record: { params: unknown; result: undefined }
  /** The open projects' `.env` values, which main scrubs and passes to every window, as projects open and close. */
  secrets: { params: string[]; result: undefined }
  /**
   * The ids of the processes the service started that are still running, as a project's Storybook, sent each time one
   * starts or ends. A service that crashes can't end them, and its children can't be found from it once it's gone, so
   * main ends these trees itself (PAR-1019).
   */
  children: { params: number[]; result: undefined }
  /** An agent called the app, so what follows is tagged as its driving (PAR-630). Main checks it, since it's data. */
  agentCalled: { params: unknown; result: undefined }
  /**
   * An agent's report, sent on as a Sentry user feedback with the editor window's screenshot (PAR-646), tied to the
   * replay and trace the service names.
   */
  report: { params: AgentReport & { replayId?: string; traceId?: string }; result: ReportSent }
}

/** Requests the main process sends to the project service. */
export interface ServiceProcessMethods {
  /** Each builder's CPU and memory, for the performance stats: builders run in processes of their own. */
  builders: { params: undefined; result: BuilderReading[] }
}

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
