/**
 * Decoding the relay's messages (PAR-1325): presence alone, as most messages are, one edit's change, and a large
 * paste's. Run it as a one-off command:
 *
 *   pnpm exec vp test bench packages/extension-multiplayer/src/decode.bench.ts
 */
import { describe, expect, test } from "vite-plus/test"
import { decodeRelayed, relayedBatch } from "./decode.ts"

const messages = {
  "presence alone": relayedBatch(),
  "one edit (300 bytes)": relayedBatch(300),
  "a large paste (64 KB)": relayedBatch(64 * 1024)
}

describe("decoding", () => {
  for (const [name, message] of Object.entries(messages)) {
    test(`decodes ${name}`, async ({ bench }) => {
      const result = await bench(name, () => {
        decodeRelayed(message)
      }).run({ iterations: 100, time: 500 })

      expect(result.latency.mean).toBeGreaterThan(0)
    })
  }
})
