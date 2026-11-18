import type { InstalledStatus } from "@parity-app/extension-host"
import { describe, expect, it } from "vite-plus/test"
import { extensionList } from "../renderer/chrome/settings/extension-list.ts"
import { settingsProject } from "./settings-view.ts"

const storybook: InstalledStatus = {
  id: "@parity-app/extension-storybook",
  displayName: "Storybook",
  prefix: "storybook",
  icon: { viewBox: "0 0 24 24", path: "M0 0h24v24H0z", color: { light: "#FF4785", dark: "#FF4785" } },
  contributes: {},
  permissions: {},
  activates: ["onDetect"],
  internal: false
}

describe("what the window sends Settings (PAR-1212)", () => {
  it("takes an extension whose logo has a brand color, so Settings still gets the project", () => {
    const sent = settingsProject.safeParse({
      overrides: [],
      extensions: {},
      unsaved: false,
      savesItself: true,
      list: extensionList([storybook], undefined)
    })

    expect(sent.success).toBe(true)
    expect(sent.data?.list[0]?.icon?.color).toEqual({ light: "#FF4785", dark: "#FF4785" })
  })
})
