import { describe, expect, it } from "vite-plus/test"
import { sampleText, sampleTextLength, shortenedText } from "./sample-text.ts"

describe("sampleText", () => {
  it("keeps short text whole", () => {
    expect(sampleText("Notification Settings")).toBe("Notification Settings")
    const exact = "x".repeat(sampleTextLength)
    expect(sampleText(exact)).toBe(exact)
  })

  it("ends long text where a sentence ends, rather than mid-word", () => {
    const text = "Manage how you receive notifications. You can enable email alerts for updates or push notifications."
    expect(sampleText(text)).toBe("Manage how you receive notifications.")
  })

  it("cuts after the last whole word, with an ellipsis, when no sentence ends in time", () => {
    const text = "Click on 'Forgot Password' on the login page, enter your email address, and follow the link."
    expect(sampleText(text)).toBe("Click on 'Forgot Password' on the login page, enter your…")
    expect(sampleText(text).length).toBeLessThanOrEqual(sampleTextLength)
  })

  it("doesn't end at a sentence too short to stand for the text", () => {
    expect(sampleText("Note. This one keeps going well past where a sample's text is cut off.")).toBe(
      "Note. This one keeps going well past where a sample's text…"
    )
  })

  it("cuts text with no spaces at the length", () => {
    expect(sampleText("a".repeat(80))).toBe(`${"a".repeat(sampleTextLength - 1)}…`)
  })
})

describe("shortenedText", () => {
  it("shortens text earlier versions cut mid-word the same way as the whole text", () => {
    const whole = "Manage how you receive notifications. You can enable email alerts for updates."
    expect(shortenedText(whole.slice(0, sampleTextLength))).toBe(sampleText(whole))
    expect(shortenedText("Control your privacy settings and security preferences. Enab")).toBe(
      "Control your privacy settings and security preferences."
    )
  })
})
