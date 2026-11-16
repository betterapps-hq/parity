import type { ExtensionStatus, InstalledStatus } from "@parity-app/extension-host"
import { describe, expect, it } from "vite-plus/test"
import { extensionList, extensionsOfProject } from "./extension-list.ts"

const icon = { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" }

const storybook: InstalledStatus = {
  id: "@parity-app/extension-storybook",
  displayName: "Storybook",
  prefix: "storybook",
  icon,
  contributes: {
    settings: {
      "storybook.openIn": {
        type: "string",
        enum: ["browser", "parity"],
        default: "browser",
        scope: "app",
        title: "Open in"
      }
    }
  },
  permissions: { processes: ["bin:storybook"] },
  activates: ["onDetect"]
}

const portless: InstalledStatus = {
  id: "@parity-app/extension-portless",
  displayName: "Portless",
  prefix: "portless",
  icon,
  contributes: {},
  permissions: {},
  activates: ["onDetect"]
}

/** Portless's host, running in the project, as the service tells the window. */
const portlessRunning: ExtensionStatus = {
  ...portless,
  state: "running",
  status: {},
  context: {},
  facts: {},
  views: {},
  settingProblems: [],
  activatedIn: 120
}

describe("the extensions Settings lists (PAR-1129)", () => {
  it("lists every installed extension from its manifest with no project open", () => {
    const list = extensionList([storybook, portless], undefined)

    expect(list.map((entry) => [entry.id, entry.name, entry.found])).toEqual([
      ["storybook", "Storybook", "Runs in projects that use Storybook"],
      ["portless", "Portless", "Runs in projects that use Portless"]
    ])
    expect(list[0]).toMatchObject({ icon, prefix: "storybook", running: false, permissions: storybook.permissions })
    expect(Object.keys(list[0]?.settings ?? {})).toEqual(["storybook.openIn"])
  })

  it("says what detection found of a tool, or that an extension found without one runs, in an open project", () => {
    const list = extensionList([storybook, portless], {
      tools: [{ id: "storybook", summary: "Storybook 10 in package.json" }],
      running: [portlessRunning],
      addsOf: (prefix) => (prefix === "storybook" ? ["Open in Storybook"] : [])
    })

    expect(list[0]).toMatchObject({ running: true, found: "Storybook 10 in package.json", adds: ["Open in Storybook"] })
    expect(list[1]).toMatchObject({ running: true, found: "Found in this project", state: "running", activatedIn: 120 })
  })

  it("says an extension isn't in the open project when neither detection nor a host found it", () => {
    const [entry] = extensionList([portless], { tools: [], running: [] })

    expect(entry).toMatchObject({ running: false, found: "No Portless in this project", adds: [] })
  })

  it("draws each extension's manifest logo and settings on its page", () => {
    const [entry] = extensionsOfProject(extensionList([storybook], undefined))

    expect(entry?.icon.displayName).toBe("StorybookLogo")
    expect(entry?.settings.map((setting) => [setting.id, setting.page, setting.control.kind])).toEqual([
      ["storybook.openIn", "ext:storybook", "select"]
    ])
  })
})
