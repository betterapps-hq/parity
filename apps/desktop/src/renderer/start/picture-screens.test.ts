import { type ContainerSpec, defaultModeSettings, type ModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { isPhone, picturedScreens } from "./picture-screens.ts"

// docs/editor.md, The start page: which screens a project's picture shows (PAR-607).

/** A design as the store lists it, showing these modes beside its main one. */
function design(name: string, kind?: ContainerSpec["kind"], beside: string[] = [], main?: string) {
  const view: NonNullable<ContainerSpec["view"]> = { modes: beside }

  if (main) {
    view.mode = main
  }

  const container: ContainerSpec = {
    id: name.toLowerCase(),
    name,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    view
  }

  if (kind) {
    container.kind = kind
  }

  return { key: `app.par#${container.id}`, container }
}

const shown = (designs: ReturnType<typeof design>[], settings: ModeSettings = defaultModeSettings, most?: number) =>
  picturedScreens(designs, settings, most).map(({ name, main, phone }) => [name, main.id, phone?.id])

describe("picturedScreens", () => {
  it("puts screens with a phone frame beside them first, then the rest, each in Layers' order", () => {
    const designs = [
      design("Button"),
      design("Dashboard", "screen", ["desktop-dark", "mobile-light"]),
      design("Stat card", "component", ["mobile-light"]),
      design("Settings", "screen", ["tablet-light"]),
      design("Pricing", undefined, ["mobile-light"])
    ]

    expect(shown(designs)).toEqual([
      ["Dashboard", "desktop-light", "mobile-light"],
      ["Pricing", "desktop-light", "mobile-light"],
      ["Button", "desktop-light", undefined],
      ["Settings", "desktop-light", undefined]
    ])
  })

  it("leaves out components and frames, and stops at the most it holds", () => {
    const designs = [
      design("Card", "component"),
      design("Hero", "frame"),
      ...["A", "B", "C"].map((name) => design(name))
    ]

    expect(shown(designs, defaultModeSettings, 2).map(([name]) => name)).toEqual(["A", "B"])
    expect(shown([design("Card", "component")])).toEqual([])
  })

  it("gives a board whose main frame is a phone no second phone", () => {
    expect(shown([design("Feed", "screen", ["desktop-light"], "mobile-light")])).toEqual([
      ["Feed", "mobile-light", undefined]
    ])
  })
})

describe("isPhone", () => {
  it("goes by the device a viewport names, else by its width", () => {
    const settings: ModeSettings = {
      ...defaultModeSettings,
      variables: [
        {
          id: "viewport",
          name: "Viewport",
          kind: "viewport",
          options: [
            { id: "narrow", name: "Narrow", width: 540 },
            { id: "fold", name: "Fold", width: 700, device: "phone" },
            { id: "wide", name: "Wide", width: 1280 }
          ]
        }
      ],
      modes: ["narrow", "fold", "wide"].map((id) => ({ id, name: id, values: { viewport: id } }))
    }

    expect(resolveModes(settings).map(isPhone)).toEqual([true, true, false])
  })
})
