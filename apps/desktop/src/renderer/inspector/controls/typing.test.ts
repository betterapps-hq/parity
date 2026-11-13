import { describe, expect, it } from "vite-plus/test"
import { readLength, readUnitNumber } from "./typing.ts"

const angle = {
  units: { deg: 1, turn: 360 },
  current: 0,
  label: "Angle",
  takes: "Enter an angle, such as 45 or 0.25turn"
}

describe("readUnitNumber", () => {
  it("reads a number in its own unit or another it takes", () => {
    expect(readUnitNumber("45", angle)).toEqual({ value: 45 })
    expect(readUnitNumber("0.25turn", angle)).toEqual({ value: 90 })
  })

  it("ends every reason with what the field takes, and codes each failure", () => {
    expect(readUnitNumber("50%", angle)).toEqual({
      code: "units",
      reason: `Can't read "50%". Enter an angle, such as 45 or 0.25turn`
    })
    expect(readUnitNumber("90 / 0", angle)).toEqual({
      code: "unreadable",
      reason: "Can't divide by zero. Enter an angle, such as 45 or 0.25turn"
    })
  })
})

describe("readLength", () => {
  it("codes a spacing step off the scale and a percentage the field doesn't take", () => {
    expect(readLength("spacing-3.3", { label: "Gap", current: undefined })).toMatchObject({ code: "out-of-range" })
    expect(readLength("50%", { label: "Gap", current: undefined })).toMatchObject({ code: "units" })
    expect(readLength("50%", { label: "Width", current: undefined, takesPercent: true })).toEqual({ percent: 50 })
  })
})
