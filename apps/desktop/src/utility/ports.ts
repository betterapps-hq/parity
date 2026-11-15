import { type AddressInfo, createServer } from "node:net"

/** A port nothing listens on now, as the system hands one out to a listener asking for any, closed again. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = createServer()
    listener.once("error", reject)
    listener.listen(0, () => {
      // SAFETY: a listener on a TCP port, once listening, has an address object; only pipes give a string.
      const { port } = listener.address() as AddressInfo
      listener.close(() => resolve(port))
    })
  })
}

/** Whether nothing listens on a port now. */
export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = createServer()
    listener.once("error", () => resolve(false))
    listener.listen(port, () => listener.close(() => resolve(true)))
  })
}

/** The port it asks for when that one's free, else one the system hands out. */
export async function choosePort(wanted: number): Promise<number> {
  return (await portFree(wanted)) ? wanted : freePort()
}
