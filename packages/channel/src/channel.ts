/**
 * Requests and replies over a port (PAR-565). Either end of a channel can ask the other for something by method name
 * and gets a promise of its answer. Every port in Parity goes through this one module: the window's to the project
 * service, the service's to the main process and the type checker's worker thread.
 *
 * Nothing here knows Electron, Node or zod. A port adapter (`ports.ts`) carries messages, the method map types them,
 * `checks` read each request's params where they arrive, and an `ErrorCodec` carries what a failure says beyond its
 * message. The sandboxed preload script bundles this module, and it can load nothing but Electron.
 */

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
export type Checks<T extends MethodMap<T>> = { [M in keyof T]: (params: unknown) => T[M]["params"] }

/** A message on a channel's port. A failed request's reply carries its message, and details the codec adds. */
export type ChannelMessage =
  | { type: "request"; id: number; method: string; params?: unknown }
  | { type: "response"; id: number; result?: unknown; error?: string; details?: unknown }

/** What a channel needs of a port: to send a message, and to hear what arrives and when the other end goes. */
export interface Port {
  post(message: ChannelMessage): void
  /** Starts delivering what arrives. Called once, when the channel connects to the port. */
  listen(listener: PortListener): void
  /** Lets go of the port, when the channel moves to another or closes. */
  close?(): void
}

export interface PortListener {
  message(data: unknown): void
  /** The other end went: closed, exited or failed. `reason` says why, when the port knows. */
  closed(reason?: Error): void
}

/** How a failure crosses a port: its message, and details the other end checks before trusting. */
export interface ErrorCodec {
  encode(error: unknown): { error: string; details?: unknown }
  decode(message: string, details: unknown): Error
}

/**
 * Failures as their messages, with an error's `details` passed on as they are. The receiving end gets an `Error` whose
 * `details` it hasn't checked.
 */
export const plainErrors: ErrorCodec = {
  encode(error) {
    const details = typeof error === "object" && error !== null ? (error as { details?: unknown }).details : undefined
    return { error: errorMessage(error), ...(details === undefined ? {} : { details }) }
  },
  decode(message, details) {
    return Object.assign(new Error(message), details === undefined ? {} : { details })
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
}

export interface Channel<Local extends MethodMap<Local>, Remote extends MethodMap<Remote>> {
  /** Asks the other end. Before the channel has a port, the request waits and goes once it connects. */
  request<M extends keyof Remote & string>(method: M, params: Remote[M]["params"]): Promise<Remote[M]["result"]>
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
  resolve(value: unknown): void
  reject(error: Error): void
  /** The port it went out on, or none while it waits for one. */
  port?: Port
  /** The request, until it's sent, so a large one isn't kept while it's answered. */
  message?: ChannelMessage
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
    disconnected = (reason) => reason ?? new Error("The other end of the channel went away")
  } = options
  let handlers = options.handlers
  let port: Port | undefined
  let closed: Error | undefined
  let nextId = 1
  const pending = new Map<number, Pending>()

  const fail = (which: (request: Pending) => boolean, error: Error) => {
    for (const [id, request] of pending) {
      if (!which(request)) continue
      pending.delete(id)
      request.reject(error)
    }
  }

  const answer = async (from: Port, id: number, method: string, params: unknown) => {
    let reply: ChannelMessage
    try {
      reply = { type: "response", id, result: await handle(method, params) }
    } catch (error) {
      reply = { type: "response", id, ...errors.encode(error) }
    }
    try {
      from.post(reply)
    } catch {
      // The port closed while the request ran: nobody is waiting for the answer.
    }
  }

  const handle = (method: string, params: unknown): unknown => {
    // With checks, they say which methods there are; without, the handlers do, once there are any.
    if (checks && !Object.hasOwn(checks, method)) throw unknownMethod(method)
    if (!handlers) throw notServing()
    if (!Object.hasOwn(handlers, method)) throw unknownMethod(method)
    const key = method as keyof Local
    const read = checks ? checks[key](params) : params
    return handlers[key](read as Local[keyof Local]["params"])
  }

  const receive = (from: Port, data: unknown) => {
    const message = readMessage(data)
    if (!message) return
    if (message.type === "request") {
      void answer(from, message.id, message.method, message.params)
      return
    }
    const request = pending.get(message.id)
    if (!request || request.port !== from) return
    pending.delete(message.id)
    if (message.error === undefined) request.resolve(message.result)
    else request.reject(errors.decode(message.error, message.details))
  }

  const letGo = (reason?: Error) => {
    const previous = port
    if (!previous) return
    port = undefined
    fail((request) => request.port === previous, disconnected(reason))
    try {
      previous.close?.()
    } catch {
      // Already closed.
    }
  }

  return {
    request(method, params) {
      if (closed) return Promise.reject(closed)
      return new Promise((resolve, reject) => {
        const id = nextId++
        const request: Pending = { resolve, reject, message: { type: "request", id, method, params } }
        pending.set(id, request)
        if (port) send(port, id, request)
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
        message: (data) => receive(next, data),
        closed: (reason) => {
          if (port === next) letGo(reason)
        }
      })
      for (const [id, request] of pending) if (!request.port) send(next, id, request)
    },
    close(reason) {
      if (closed) return
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
      if (message) to.post(message)
    } catch (error) {
      pending.delete(id)
      request.reject(error instanceof Error ? error : new Error(errorMessage(error)))
    }
  }
}

/** A channel message, or nothing for anything else that arrives on the port. */
function readMessage(data: unknown): ChannelMessage | undefined {
  if (typeof data !== "object" || data === null) return undefined
  const message = data as Record<string, unknown>
  if (typeof message.id !== "number") return undefined
  if (message.type === "request") {
    return { type: "request", id: message.id, method: String(message.method), params: message.params }
  }
  if (message.type !== "response") return undefined
  if (message.error === undefined) return { type: "response", id: message.id, result: message.result }
  return { type: "response", id: message.id, error: errorMessage(message.error), details: message.details }
}

/** A thrown value's message. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : String(error)
}
