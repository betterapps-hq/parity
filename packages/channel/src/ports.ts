import type { ChannelMessage, Port, PortListener } from "./channel.ts"
import { isObject } from "./guards.ts"

/**
 * Port adapters: one for the DOM's `MessagePort`, one for Node's and Electron's event emitters, and a pair in memory for
 * tests. Each is typed by what it uses, so this package imports neither Electron nor Node.
 */

/** A DOM `MessagePort`, as the preload script holds its end of the window's channel. */
export interface DomMessagePort {
  postMessage(message: ChannelMessage): void
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
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what an event gives, which the port reads
  on(event: string, listener: (value: unknown) => void): void
  postMessage(message: ChannelMessage): void
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
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a close event gives, read by each reason
  closedBy?: Record<string, (value: unknown) => Error | undefined>
}

/** An Electron or Node port, process or thread. */
export function nodePort(emitter: NodeEmitter, { wrapped = false, closedBy = {} }: NodePortOptions = {}): Port {
  const port: Port = {
    post: (message) => emitter.postMessage(message),
    listen(listener) {
      emitter.on("message", (value) => {
        if (!wrapped) {
          listener.message(value)

          return
        }

        const event: { data?: unknown } = isObject(value) ? value : {}
        listener.message(event.data)
      })

      for (const [event, reason] of Object.entries(closedBy)) {
        emitter.on(event, (value) => listener.closed(reason(value)))
      }

      emitter.start?.()
    }
  }

  if (emitter.close) {
    port.close = () => emitter.close?.()
  }

  return port
}

/** One end of a pair of ports in memory, which a test can close as the other end would see it. */
export interface MemoryPort extends Port {
  /** Every message sent from this end, oldest first. */
  readonly sent: ChannelMessage[]
  /** Delivers `data` to this end as though the other end had sent it, such as a malformed message. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: whatever the other end sends, malformed or not
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
        if (!open) {
          throw new Error("The port is closed")
        }

        end.sent.push(message)
        const copy = structuredClone(message)
        setTimeout(() => end.other?.deliver(copy), 0)
      },
      listen(listener) {
        end.listener = listener
      },
      close() {
        if (!open) {
          return
        }

        open = false
        setTimeout(() => end.other?.listener?.closed(), 0)
      },
      deliver(data) {
        if (open) {
          end.listener?.message(data)
        }
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
