import type { JsonValue } from "@parity-app/extension"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import type { ExtensionEventName } from "./events.ts"
import { frameOwner, type LongFrame, mainThreadMeter, scriptOwner } from "./main-thread.ts"

const multiplayer = "@parity-app/extension-multiplayer"
const agents = "@parity-app/extension-agent-presence"

/** An event's attributes, as a test reads them. */
const asRecord = z.record(z.string(), z.json().optional())

/** A meter whose clock the test moves, recording what it sends and which extensions went over budget. */
function meter(options: { rendersCounted?: () => boolean; budgetMs?: number } = {}) {
  let time = 0
  const events: { name: ExtensionEventName; attributes: Record<string, JsonValue | undefined> }[] = []
  const over: string[] = []

  const measured = mainThreadMeter({
    record: (name, attributes) => void events.push({ name, attributes: asRecord.parse(attributes) }),
    ownerOf: (sourceURL) => scriptOwner(sourceURL, [multiplayer, agents]),
    now: () => time,
    overBudget: (extension) => void over.push(extension),
    ...options
  })

  const named = (name: ExtensionEventName) => events.flatMap((event) => (event.name === name ? [event.attributes] : []))

  return { measured, named, over, wait: (ms: number) => (time += ms) }
}

const frame = (scripts: [string, number][], durationMs = 120, blockingMs = 70): LongFrame => ({
  durationMs,
  blockingMs,
  scripts: scripts.map(([sourceURL, ms]) => ({ sourceURL, durationMs: ms }))
})

describe("window modules' time on the main thread", () => {
  it("records a call over 16 ms as slow, at most once per extension a minute, counting the rest", () => {
    const { measured, named, wait } = meter()

    measured.called(multiplayer, "presence.onPointer", 4)
    measured.called(multiplayer, "presence.onPointer", 30.4)
    measured.called(multiplayer, "selection.onChange", 80)
    measured.called(agents, "agents.onStep", 17)

    expect(named("extension.slow")).toEqual([
      { extension: multiplayer, kind: "callback", api: "presence.onPointer", durationMs: 30, blockingMs: 0 },
      { extension: agents, kind: "callback", api: "agents.onStep", durationMs: 17, blockingMs: 0 }
    ])

    wait(60_000)
    measured.called(multiplayer, "selection.onChange", 80)

    expect(named("extension.slow").at(-1)).toEqual({
      extension: multiplayer,
      kind: "callback",
      api: "selection.onChange",
      durationMs: 80,
      blockingMs: 30
    })
  })

  it("puts a long frame down to the module whose chunk ran most of its scripts", () => {
    const { measured, named } = meter()

    // Mostly Parity's own: nobody's.
    measured.frame(
      frame([
        ["app://renderer/assets/index-abc.js", 60],
        ["app://renderer/assets/extension-multiplayer-window-1a2b.js", 20]
      ])
    )
    // Mostly the multiplayer extension's, built and from the dev server alike.
    measured.frame(
      frame([
        ["app://renderer/assets/extension-multiplayer-window-1a2b.js", 50],
        ["http://localhost:5173/@fs/D:/canvas/packages/extension-multiplayer/src/layers.tsx?t=1", 30],
        ["app://renderer/assets/index-abc.js", 10]
      ])
    )
    measured.frame(frame([["app://renderer/assets/extension-multiplayer-window-1a2b.js", 50]], 300, 250))
    measured.minute([{ extension: multiplayer, layers: 2 }])

    expect(named("extension.slow")).toEqual([
      { extension: multiplayer, kind: "frame", durationMs: 120, blockingMs: 70 }
    ])
    expect(named("extension.mainThread")).toEqual([
      {
        extension: multiplayer,
        callbacks: 0,
        callbackMs: 0,
        callbackP95Ms: 0,
        longFrames: 2,
        slow: 2,
        layers: 2
      }
    ])
  })

  it("records each active module's minute, even an idle one, and starts the next minute empty", () => {
    const { measured, named } = meter({ rendersCounted: () => true })

    for (let call = 1; call <= 20; call++) {
      measured.called(multiplayer, "presence.onPointer", call)
    }

    measured.rendered(multiplayer)
    measured.rendered(multiplayer)
    // Not active in a visible tab at the minute's end: nothing for it.
    measured.called(agents, "agents.onStep", 3)
    measured.minute([
      { extension: multiplayer, layers: 3 },
      { extension: "@parity-app/extension-idle", layers: 0 }
    ])
    measured.minute([{ extension: multiplayer, layers: 3 }])

    expect(named("extension.mainThread")).toEqual([
      {
        extension: multiplayer,
        callbacks: 20,
        callbackMs: 210,
        callbackP95Ms: 20,
        longFrames: 0,
        slow: 4,
        layers: 3,
        layerRenders: 2
      },
      {
        extension: "@parity-app/extension-idle",
        callbacks: 0,
        callbackMs: 0,
        callbackP95Ms: 0,
        longFrames: 0,
        slow: 0,
        layers: 0,
        layerRenders: 0
      },
      {
        extension: multiplayer,
        callbacks: 0,
        callbackMs: 0,
        callbackP95Ms: 0,
        longFrames: 0,
        slow: 0,
        layers: 3,
        layerRenders: 0
      }
    ])
  })

  it("says once when a module takes more than its budget in a minute", () => {
    const { measured, over } = meter({ budgetMs: 100 })

    measured.called(multiplayer, "presence.onPointer", 60)
    measured.minute([])
    measured.called(multiplayer, "presence.onPointer", 60)

    expect(over).toEqual([])

    measured.frame(frame([["app://renderer/assets/extension-multiplayer-window-1a2b.js", 50]], 120, 70))
    measured.called(multiplayer, "presence.onPointer", 60)

    expect(over).toEqual([multiplayer])
  })
})

describe("scripts' owners", () => {
  it("names the extension a script's file belongs to, and nobody for Parity's own", () => {
    const ids = [multiplayer, agents]

    expect(scriptOwner("app://renderer/assets/extension-agent-presence-window-9f.js", ids)).toBe(agents)
    expect(scriptOwner("file:///C:/Parity/node_modules/@parity-app/extension-multiplayer/src/window.tsx", ids)).toBe(
      multiplayer
    )
    expect(scriptOwner("app://renderer/assets/window-9f.js", ids)).toBeUndefined()
    expect(scriptOwner("app://renderer/assets/presence-ui-1.js?extension-multiplayer/", ids)).toBeUndefined()
    expect(scriptOwner("", ids)).toBeUndefined()
  })

  it("leaves a frame split between modules to neither", () => {
    expect(
      frameOwner(
        frame([
          ["/extension-multiplayer/a.js", 40],
          ["/extension-agent-presence/b.js", 40]
        ]),
        (sourceURL) => scriptOwner(sourceURL, [multiplayer, agents])
      )
    ).toBeUndefined()
  })
})
