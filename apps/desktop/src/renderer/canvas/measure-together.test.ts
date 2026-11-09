import { describe, expect, it } from "vite-plus/test"
import { measureTogether } from "./measure-together.ts"

/** A batch run by hand, which notes each read, write and change around the writes, in order. */
function batch() {
  const log: string[] = []
  let flush: (() => void) | undefined
  const measure = measureTogether(
    (writes) => {
      log.push("change")
      writes()
      log.push("done")
    },
    (scheduled) => {
      flush = scheduled
    }
  )
  const board = (name: string, size: number | undefined) => ({
    read: () => {
      log.push(`read ${name}`)
      return size
    },
    write: (value: number) => log.push(`write ${name} ${value}`)
  })
  return { log, measure, board, run: () => flush?.() }
}

describe("measureTogether", () => {
  it("reads every measure before writing any, and writes them as one change", () => {
    const { log, measure, board, run } = batch()
    measure({}, board("a", 10))
    measure({}, board("b", 20))
    expect(log).toEqual([])
    run()
    expect(log).toEqual(["read a", "read b", "change", "write a 10", "write b 20", "done"])
  })

  it("runs an owner's latest measure only, once", () => {
    const { log, measure, board, run } = batch()
    const owner = {}
    measure(owner, board("first", 1))
    measure(owner, board("latest", 2))
    run()
    expect(log).toEqual(["read latest", "change", "write latest 2", "done"])
  })

  it("leaves out a measure taken back, but not one asked for after it", () => {
    const { log, measure, board, run } = batch()
    const owner = {}
    const cancel = measure(owner, board("gone", 1))
    cancel()
    measure({}, board("other", 1))
    run()
    expect(log).toEqual(["read other", "change", "write other 1", "done"])

    const replaced = measure(owner, board("old", 1))
    measure(owner, board("new", 1))
    replaced()
    log.length = 0
    run()
    expect(log).toEqual(["read new", "change", "write new 1", "done"])
  })

  it("writes nothing for what had nothing to measure, and makes no change when nothing did", () => {
    const { log, measure, board, run } = batch()
    measure({}, board("hidden", undefined))
    run()
    expect(log).toEqual(["read hidden"])
  })

  it("runs measures asked for while writing in a batch of their own", () => {
    const log: string[] = []
    const flushes: (() => void)[] = []
    const measure = measureTogether(undefined, (flush) => flushes.push(flush))
    measure(
      {},
      {
        read: () => 1,
        write: () => {
          log.push("write first")
          measure({}, { read: () => 2, write: () => log.push("write second") })
        }
      }
    )
    flushes.shift()?.()
    expect(log).toEqual(["write first"])
    flushes.shift()?.()
    expect(log).toEqual(["write first", "write second"])
  })
})
