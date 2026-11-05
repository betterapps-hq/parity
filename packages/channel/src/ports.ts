import type { ChannelMessage, Port, PortListener } from "./channel.ts"

/**
 * Port adapters: one for the DOM's `MessagePort`, one for Node's and Electron's event emitters, and a pair in memory for
 * tests. Each is typed by what it uses, so this package imports neither Electron nor Node.
 */

/** A DOM `MessagePort`, as the preload script holds its end of the window's channel. */
export interface DomMessagePort {
  postMessage(message: unknown): void
  addEventListener(type: "message" | "close", listener: (event: { data?: unknown }) => void): void
  start(): void
  close(): void
}

/** A DOM `MessagePort`. Chromium tells it when the other end closes, so requests sent on it fail then. */
export function domPort(port: DomMessagePort): Port {
  return {
    post: (message) => port.postMessage(message),
    listen(listener) {
      port.addEventListener("message", (event) => listener.message(event.data))
      port.addEventListener("close", () => listener.closed())
      port.start()
    },
    close: () => port.close()
  }
}

/**
 * Something with `on("message")` and `postMessage`: Electron's `MessagePortMain`, `parentPort` and `UtilityProcess`,
 * and Node's `Worker` and a worker's `parentPort`.
 */
export interface NodeEmitter {
  on(event: string, listener: (value: unknown) => void): unknown
  postMessage(message: unknown): void
  start?(): void
  close?(): void
}

export interface NodePortOptions {
  /**
   * Whether each message arrives wrapped as `{ data }`, as Electron's `MessagePortMain` and `parentPort` deliver them.
   * Node's and Electron's processes and threads deliver the message itself.
   */
  wrapped?: boolean
  /** The events that mean the other end went, each with why, from what the event gives. */
  closedBy?: Record<string, (value: unknown) => Error | undefined>
}

/** An Electron or Node port, process or thread. */
export function nodePort(emitter: NodeEmitter, { wrapped = false, closedBy = {} }: NodePortOptions = {}): Port {
  return {
    post: (message) => emitter.postMessage(message),
    listen(listener) {
      emitter.on("message", (value: unknown) =>
        listener.message(wrapped ? (value as { data?: unknown } | undefined)?.data : value)
      )
      for (const [event, reason] of Object.entries(closedBy)) {
        emitter.on(event, (value: unknown) => listener.closed(reason(value)))
      }
      emitter.start?.()
    },
    ...(emitter.close ? { close: () => emitter.close?.() } : {})
  }
}

/** One end of a pair of ports in memory, which a test can close as the other end would see it. */
export interface MemoryPort extends Port {
  /** Every message sent from this end, oldest first. */
  readonly sent: ChannelMessage[]
  /** Delivers `data` to this end as though the other end had sent it, such as a malformed message. */
  deliver(data: unknown): void
}

/**
 * Two ports joined in memory. A message is copied as a real port copies it, and arrives a task later. Closing either
 * end tells the other.
 */
export function memoryPorts(): [MemoryPort, MemoryPort] {
  const make = (): MemoryPort & { listener?: PortListener; other?: MemoryPort & { listener?: PortListener } } => {
    let open = true
    const end: MemoryPort & { listener?: PortListener; other?: MemoryPort & { listener?: PortListener } } = {
      sent: [],
      post(message) {
        if (!open) throw new Error("The port is closed")
        end.sent.push(message)
        const copy = structuredClone(message)
        setTimeout(() => end.other?.deliver(copy), 0)
      },
      listen(listener) {
        end.listener = listener
      },
      close() {
        if (!open) return
        open = false
        setTimeout(() => end.other?.listener?.closed(), 0)
      },
      deliver(data) {
        if (open) end.listener?.message(data)
      }
    }
    return end
  }
  const a = make()
  const b = make()
  a.other = b
  b.other = a
  return [a, b]
}
