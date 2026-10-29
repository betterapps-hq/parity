import { describe, expect, it } from "vitest"
import { linuxAnonymous, macFootprints, windowsAnswer } from "./memory-readings.ts"

describe("windowsAnswer", () => {
  it("reads each process's bytes, leaving out the ones the reader couldn't read", () => {
    expect(windowsAnswer("7852=39845888 29156=608174080 41000=-1\r\n")).toEqual(
      new Map([
        [7852, 39845888],
        [29156, 608174080]
      ])
    )
  })

  it("reads nothing from an empty answer", () => {
    expect(windowsAnswer("")).toEqual(new Map())
  })
})

describe("linuxAnonymous", () => {
  const status = [
    "Name:\tparity",
    "VmRSS:\t  412340 kB",
    "RssAnon:\t  301200 kB",
    "RssFile:\t   98700 kB",
    "RssShmem:\t   12440 kB",
    ""
  ].join("\n")

  it("reads the anonymous resident memory, without the files and shared memory", () => {
    expect(linuxAnonymous(status)).toBe(301200 * 1024)
  })

  it("reads nothing from a kernel too old to say", () => {
    expect(linuxAnonymous("Name:\tparity\nVmRSS:\t  412340 kB\n")).toBeUndefined()
  })
})

describe("macFootprints", () => {
  const top = [
    "Processes: 612 total, 3 running, 609 sleeping, 3201 threads",
    "2026/10/29 03:40:12",
    "Load Avg: 2.10, 2.31, 2.45",
    "PhysMem: 31G used (3120M wired, 2001M compressor), 640M unused.",
    "",
    "PID    MEM",
    "51234  412M",
    "51240  1201M+",
    "51242  96K-",
    "51250  1.5G",
    "1      23M",
    ""
  ].join("\n")

  it("reads each process's footprint after the heading, in bytes", () => {
    const sizes = macFootprints(top)
    expect(sizes.get(51234)).toBe(412 * 2 ** 20)
    expect(sizes.get(51240)).toBe(1201 * 2 ** 20)
    expect(sizes.get(51242)).toBe(96 * 2 ** 10)
    expect(sizes.get(51250)).toBe(Math.round(1.5 * 2 ** 30))
    expect(sizes.size).toBe(5)
  })

  it("reads nothing without the heading", () => {
    expect(macFootprints("51234  412M\n")).toEqual(new Map())
  })
})
