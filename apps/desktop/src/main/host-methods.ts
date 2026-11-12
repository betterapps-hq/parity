import { parseData } from "@parity-app/core"
import { z } from "zod"
import { ipc } from "../shared/channels.ts"
import {
  type HostMethod,
  type HostMethodRead,
  type HostParams,
  type HostResult,
  hostMethod,
  type OpenMethod
} from "../shared/host-methods.ts"
import { onPage } from "./parity-page.ts"

/**
 * Main's side of `hostMethods` (PAR-965): one registration answers everything a window sends. It finds the method,
 * checks who's asking, checks the params, and only then runs the handler. Nothing here knows Electron, so it and the
 * handlers run in tests without it.
 */

type Answer<Result> = undefined extends Result ? Result | void : Result

/**
 * Answers each of `hostMethods`. A handler is given the Parity window that asked, which the registration has checked;
 * an open method's handler is given the sender's event instead, since anything may have sent it.
 */
export type HostHandlers<Event, Window> = {
  [M in HostMethod]: (
    params: HostParams<M>,
    from: M extends OpenMethod ? Event : Window
  ) => Answer<HostResult<M>> | Promise<Answer<HostResult<M>>>
}

/** Any method's handler, as the registration calls it once the method's schema has read the params. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- params and an answer that only the method's name types
type AnyHandler<Event, Window> = (params: unknown, from: Event | Window) => unknown

/** Hears what arrives on a channel, as `ipcMain` does: the sender's event, then the method, its params and its trace. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a window sent over IPC, read here
type Heard<Event, Result> = (event: Event, method: unknown, params: unknown, trace: unknown) => Result

export interface HostOptions<Event, Window> {
  /** Where requests arrive: `ipcMain`, or a test's stand-in. */
  ipc: {
    handle: (channel: string, listener: Heard<Event, Promise<unknown>>) => void
    on: (channel: string, listener: Heard<Event, void>) => void
  }
  handlers: HostHandlers<Event, Window>
  /**
   * The Parity window `event` came from, when it came from that window's own page: its main frame, at Parity's address.
   * Nothing for a guest, an offscreen render window or any other page.
   */
  appWindow: (event: Event) => Window | undefined
  /** Runs a handler, given its method and the trace the request came with, as a span that times it does. */
  around: <Result>(request: { method: string; trace: unknown }, answer: () => Result) => Result | Promise<Result>
}

/** What the sender check needs to know of the page a request came from. */
export interface SendingPage {
  /** Whether it's an offscreen render window's page, which runs project code. */
  render: boolean
  /** Whether the request came from the page's main frame, rather than a frame inside it. */
  mainFrame: boolean
  /** The page's address now. */
  url: string
}

/**
 * Whether a request came from Parity's own page: a window's main frame, not an offscreen render window's, showing the
 * page at `rendererUrl`. A query or hash doesn't make it another page; another path, host or scheme does.
 */
export function fromParityPage(page: SendingPage, rendererUrl: string): boolean {
  return !page.render && page.mainFrame && onPage(page.url, rendererUrl)
}

/** A method's name as it goes in a refusal: quoted, unless it isn't a short string, so a page can't fill the log. */
const shortName = z.string().max(64)

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a method's name as a window sent it
function nameInRefusal(name: unknown): string {
  const read = shortName.safeParse(name)

  return read.success ? JSON.stringify(read.data) : "of that name"
}

/**
 * Answers windows over `ipc.ask` and `ipc.tell`. A request is refused for a method main doesn't have, from a sender the
 * method doesn't take, or with params its schema refuses: an asked one fails with why, and a told one is dropped.
 */
export function answerWindows<Event, Window>({
  ipc: wire,
  handlers,
  appWindow,
  around
}: HostOptions<Event, Window>): void {
  /** Who a method's handler is given: the sender for an open method, else the Parity window, or nothing to refuse it. */
  const asker = ({ open }: HostMethodRead, event: Event) => (open ? event : appWindow(event))

  /** Runs a method's handler with params its schema read, for an answer that goes back to the window as it is. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- params and an answer that only the method's name types
  const run = (found: HostMethodRead, params: unknown, from: Event | Window): unknown =>
    // SAFETY: `found` is the method's own entry, so `params` were read with its schema and `from` is the sender it
    // takes. TypeScript can't follow a method's name to its handler through the union of them all.
    (handlers[found.method] as AnyHandler<Event, Window>)(params, from)

  wire.handle(ipc.ask, async (event, name, sent, trace) => {
    const found = hostMethod(name)

    if (!found || found.oneWay) {
      throw new TypeError(`Main has no method ${nameInRefusal(name)} to ask`)
    }

    return around({ method: found.method, trace }, () => {
      const from = asker(found, event)

      if (from === undefined) {
        throw new Error(`Only the Parity window can ask for ${found.method}.`)
      }

      return run(found, parseData(found.params, sent), from)
    })
  })

  wire.on(ipc.tell, (event, name, sent, trace) => {
    const found = hostMethod(name)

    if (!found?.oneWay) {
      return
    }

    const from = asker(found, event)
    const params = found.params.safeParse(sent)

    if (from === undefined || !params.success) {
      return
    }

    // Nothing answers, so a failure is only on the span and reported as an unhandled rejection.
    void around({ method: found.method, trace }, () => run(found, params.data, from))
  })
}
