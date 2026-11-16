/**
 * Requests and replies over a port (PAR-565). Either end of a channel can ask the other for something by method name
 * and gets a promise of its answer. Every port in Parity goes through this one module: the window's to the project
 * service, the service's to the main process and the type checker's worker thread.
 *
 * Nothing here knows Electron, Node or zod. A port adapter (`ports.ts`) carries messages, the method map types them,
 * `checks` read each request's params where they arrive, and an `ErrorCodec` carries what a failure says beyond its
 * message. The sandboxed preload script bundles this module, and it can load nothing but Electron.
 */

import { isObject } from "./guards.ts"

/** One method's params and result. */
export interface Method {
  params: unknown
  result: unknown
}

/** A method map, such as `ServiceMethods`: each method's params and result, by name. */
export type MethodMap<T> = { [M in keyof T]: Method }

/** Answers each of a method map's requests. A method whose result is `undefined` may return nothing. */
export type Handlers<T extends MethodMap<T>> = {
  [M in keyof T]: (params: T[M]["params"]) => Answer<T[M]["result"]> | Promise<Answer<T[M]["result"]>>
}

type Answer<Result> = undefined extends Result ? Result | void : Result

/**
 * Reads each method's params as they arrive, before its handler sees them: returns them, or throws why they're
 * refused. A channel given checks refuses a method they don't name.
 */
export type Checks<T extends MethodMap<T>> = {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: params as the other end sent them, read here
  [M in keyof T]: (params: unknown) => T[M]["params"]
}

/**
 * A message on a channel's port. A failed request's reply carries its message, and details the codec adds. A request
 * may carry the trace it was sent in (PAR-629), which the channel passes on without reading; older senders leave it out.
 */
export type ChannelMessage =
  | { type: "request"; id: number; method: string; params?: unknown; trace?: unknown }
  | { type: "response"; id: number; result?: unknown; error?: string; details?: unknown }

type RequestMessage = Extract<ChannelMessage, { type: "request" }>

/** What a channel needs of a port: to send a message, and to hear what arrives and when the other end goes. */
export interface Port {
  post(message: ChannelMessage): void
  /** Starts delivering what arrives. Called once, when the channel connects to the port. */
  listen(listener: PortListener): void
  /** Lets go of the port, when the channel moves to another or closes. */
  close?(): void
}

export interface PortListener {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: whatever arrives on the port, which the channel reads
  message(data: unknown): void
  /** The other end went: closed, exited or failed. `reason` says why, when the port knows. */
  closed(reason?: Error): void
}

/** A failure as it crosses a port: its message, and what the codec adds. */
interface EncodedError {
  error: string
  details?: unknown
}

/** How a failure crosses a port: its message, and details the other end checks before trusting. */
export interface ErrorCodec {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
  encode(error: unknown): EncodedError
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: details as the other end sent them, read here
  decode(message: string, details: unknown): Error
}

/**
 * Failures as their messages, with an error's `details` passed on as they are. The receiving end gets an `Error` whose
 * `details` it hasn't checked.
 */
export const plainErrors: ErrorCodec = {
  encode(error) {
    const encoded: EncodedError = { error: errorMessage(error) }
    const details = isObject(error) && "details" in error ? error.details : undefined

    if (details !== undefined) {
      encoded.details = details
    }

    return encoded
  },
  decode(message, details) {
    const error = new Error(message)

    if (details !== undefined) {
      Object.assign(error, { details })
    }

    return error
  }
}

export interface ChannelOptions<Local extends MethodMap<Local>> {
  /** Answers the other end's requests. Without them, until `serve`, each request fails with `notServing`. */
  handlers?: Handlers<Local>
  /** Reads every request's params before its handler sees them. Only ports that cross a boundary need them. */
  checks?: Checks<Local>
  errors?: ErrorCodec
  /** What a request for a method this end doesn't answer fails with. */
  unknownMethod?: (method: string) => Error
  /** What a request fails with while nothing answers here yet. */
  notServing?: () => Error
  /** What a request sent fails with when its port closes or the channel moves to another one. */
  disconnected?: (reason?: Error) => Error
  /** The trace each request is sent in, read as it's sent, for the other end's `around`. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the channel carries a trace without reading it; `around` reads it
  trace?: () => unknown
  /**
   * Runs each request's handler, given its method and the trace it came with, as a span that times it does. Its result
   * is the answer, so it must return what `answer` gives.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- it runs any method's handler, and passes on what that answers
  around?: (request: { method: string; trace: unknown }, answer: () => unknown) => unknown
}

export interface Channel<Local extends MethodMap<Local>, Remote extends MethodMap<Remote>> {
  /** Asks the other end. Before the channel has a port, the request waits and goes once it connects. */
  request<M extends keyof Remote & string>(
    method: M,
    params: Remote[M]["params"],
    /** The trace it's sent in, instead of the channel's `trace`. */
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the channel carries a trace without reading it; `around` reads it
    trace?: unknown
  ): Promise<Remote[M]["result"]>
  /** Starts answering the other end, or answers it with these handlers from now on. */
  serve(handlers: Handlers<Local>): void
  /**
   * Sends and receives over `port` from now on, after sending what waited for it. A port it had before is let go, and
   * what was sent on it and not answered fails, since the other end won't answer it.
   */
  connect(port: Port): void
  /** Fails every request waiting and every one made after, with `reason`, and lets go of the port. */
  close(reason: Error): void
  /** Whether it has a port now. */
  readonly connected: boolean
  /** How many of its requests haven't been answered. */
  readonly waiting: number
}

interface Pending {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a reply's result as it arrived, typed by the caller's method map
  resolve(value: unknown): void
  reject(error: Error): void
  /** The port it went out on, or none while it waits for one. */
  port?: Port
  /** The request, until it's sent, so a large one isn't kept while it's answered. */
  message?: RequestMessage
}

/**
 * A channel for requests both ways: `Local` is what this end answers, `Remote` what it asks of the other end. It sends
 * nothing until `connect` gives it a port.
 */
export function createChannel<Local extends MethodMap<Local>, Remote extends MethodMap<Remote>>(
  options: ChannelOptions<Local> = {}
): Channel<Local, Remote> {
  const {
    checks,
    errors = plainErrors,
    unknownMethod = (method) => new Error(`Unknown method ${method}`),
    notServing = () => new Error("Nothing answers requests here yet"),
    disconnected = (reason) => reason ?? new Error("The other end of the channel went away"),
    trace: currentTrace,
    around
  } = options

  let handlers = options.handlers
  let port: Port | undefined
  let closed: Error | undefined
  let nextId = 1
  const pending = new Map<number, Pending>()

  const fail = (which: (request: Pending) => boolean, error: Error) => {
    for (const [id, request] of pending) {
      if (!which(request)) {
        continue
      }

      pending.delete(id)
      request.reject(error)
    }
  }

  const answer = async (from: Port, request: RequestMessage) => {
    const { id, method, trace } = request
    let reply: ChannelMessage

    try {
      const run = () => handle(request)
      reply = { type: "response", id, result: await (around ? around({ method, trace }, run) : run()) }
    } catch (error) {
      reply = { type: "response", id, ...errors.encode(error) }
    }

    try {
      from.post(reply)
    } catch {
      // The port closed while the request ran: nobody is waiting for the answer.
    }
  }

  const handle = ({ method, params }: RequestMessage) => {
    // With checks, they say which methods there are; without, the handlers do, once there are any.
    if (checks && !Object.hasOwn(checks, method)) {
      throw unknownMethod(method)
    }

    if (!handlers) {
      throw notServing()
    }

    if (!Object.hasOwn(handlers, method)) {
      throw unknownMethod(method)
    }

    // SAFETY: `Object.hasOwn` found the method among the handlers' own keys, which are `Local`'s.
    const key = method as keyof Local

    // SAFETY: a channel without checks is one whose port doesn't cross a boundary (see `checks`), so the other end sent
    // the params its method map says.
    const read = checks ? checks[key](params) : (params as Local[keyof Local]["params"])

    return handlers[key](read)
  }

  const receive = (from: Port, message: ChannelMessage | undefined) => {
    if (!message) {
      return
    }

    if (message.type === "request") {
      void answer(from, message)

      return
    }

    const request = pending.get(message.id)

    if (!request || request.port !== from) {
      return
    }

    pending.delete(message.id)

    if (message.error === undefined) {
      request.resolve(message.result)
    } else {
      request.reject(errors.decode(message.error, message.details))
    }
  }

  const letGo = (reason?: Error) => {
    const previous = port

    if (!previous) {
      return
    }

    port = undefined
    fail((request) => request.port === previous, disconnected(reason))

    try {
      previous.close?.()
    } catch {
      // Already closed.
    }
  }

  return {
    request(method, params, given) {
      if (closed) {
        return Promise.reject(closed)
      }

      const trace = given ?? currentTrace?.()

      return new Promise((resolve, reject) => {
        const id = nextId++

        const message: RequestMessage = { type: "request", id, method, params }

        if (trace !== undefined) {
          message.trace = trace
        }

        const request: Pending = { resolve, reject, message }
        pending.set(id, request)

        if (port) {
          send(port, id, request)
        }
      })
    },
    serve(next) {
      handlers = next
    },
    connect(next) {
      if (closed) {
        next.close?.()

        return
      }

      letGo()
      port = next
      next.listen({
        message: (data) => receive(next, readMessage(data)),
        closed: (reason) => {
          if (port === next) {
            letGo(reason)
          }
        }
      })

      for (const [id, request] of pending) {
        if (!request.port) {
          send(next, id, request)
        }
      }
    },
    close(reason) {
      if (closed) {
        return
      }

      closed = reason
      const previous = port
      port = undefined
      fail(() => true, reason)

      try {
        previous?.close?.()
      } catch {
        // Already closed.
      }
    },
    get connected() {
      return port !== undefined
    },
    get waiting() {
      return pending.size
    }
  }

  function send(to: Port, id: number, request: Pending): void {
    const { message } = request
    request.port = to
    request.message = undefined

    try {
      if (message) {
        to.post(message)
      }
    } catch (error) {
      pending.delete(id)
      request.reject(error instanceof Error ? error : new Error(errorMessage(error)))
    }
  }
}

/** A message's fields as they arrive on the port, each unread. */
interface Arrived {
  type?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
  trace?: unknown
  result?: unknown
  error?: unknown
  details?: unknown
}

/** A channel message, or nothing for anything else that arrives on the port. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: whatever arrives on the port, read here
function readMessage(data: unknown): ChannelMessage | undefined {
  if (!isObject(data)) {
    return undefined
  }

  const message: Arrived = data

  if (!isId(message.id)) {
    return undefined
  }

  if (message.type === "request") {
    const request: RequestMessage = {
      type: "request",
      id: message.id,
      method: String(message.method),
      params: message.params
    }

    if (message.trace !== undefined) {
      request.trace = message.trace
    }

    return request
  }

  if (message.type !== "response") {
    return undefined
  }

  if (message.error === undefined) {
    return { type: "response", id: message.id, result: message.result }
  }

  return { type: "response", id: message.id, error: errorMessage(message.error), details: message.details }
}

/** Whether a message's `id` is a whole number, as a channel numbers its requests. */
function isId(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

/** A thrown value's message. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
