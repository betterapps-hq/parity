import { defineExtension, type ExtensionApi } from "@parity-app/extension"
import { startRoomRelay } from "./relay.ts"

/*
 * The multiplayer extension's Node half (docs/proposals/extensions-in-the-window.md, "An example"): it runs the relay
 * copies of the app in a live room talk through, on this machine, for its window module.
 */

/** What the window module calls. */
export interface RelayApi extends ExtensionApi {
  /** Starts the relay on 127.0.0.1 at `port`, or finds the one another copy started there. */
  ensureRelay(port: number): Promise<"started" | "shared">
}

/**
 * The relay this process started, by port, so a second tab finds it rather than starting another. One another copy
 * runs isn't kept: it stops when that copy closes its project, and the next call starts one here.
 */
const relays = new Map<number, Promise<"started" | "shared">>()

export default defineExtension({
  activate(): RelayApi {
    return {
      ensureRelay(port) {
        let relay = relays.get(port)

        if (!relay) {
          relay = startRoomRelay(port)
          relays.set(port, relay)
          relay.then(
            (result) => {
              if (result === "shared") {
                relays.delete(port)
              }
            },
            () => relays.delete(port)
          )
        }

        return relay
      }
    }
  }
})
