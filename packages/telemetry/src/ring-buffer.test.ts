import { describe, expect, it } from "vite-plus/test"
import { RingBuffer } from "./index.ts"

describe("RingBuffer", () => {
  it("keeps everything until it's full, oldest first", () => {
    const buffer = new RingBuffer<number>(3)
    buffer.push(1)
    buffer.push(2)
    expect(buffer.toArray()).toEqual([1, 2])
    expect(buffer.size).toBe(2)
  })

  it("drops the oldest once full, however many times it wraps", () => {
    const buffer = new RingBuffer<number>(3)

    for (let item = 1; item <= 8; item++) {
      buffer.push(item)
    }

    expect(buffer.toArray()).toEqual([6, 7, 8])
    expect(buffer.size).toBe(3)
  })

  it("holds at least one item", () => {
    expect(() => new RingBuffer(0)).toThrow("at least 1 item, not 0")
    expect(() => new RingBuffer(2.5)).toThrow("at least 1 item, not 2.5")
  })
})
