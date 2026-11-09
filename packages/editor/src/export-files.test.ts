import { describe, expect, it } from "vite-plus/test"
import {
  copyScale,
  describeFiles,
  exportFiles,
  largestPicture,
  nextExportSize,
  pictureCrop,
  planExport,
  planPicture,
  safeName
} from "./export-files.ts"

describe("the files an export writes", () => {
  it("names each layer's file after it, with each size's suffix and format", () => {
    const files = exportFiles(
      ["Headline"],
      [
        { format: "png", scale: 1 },
        { format: "png", scale: 2 },
        { format: "jpg", scale: 3 }
      ]
    )

    expect(files.map((file) => file.name)).toEqual(["Headline.png", "Headline@2x.png", "Headline@3x.jpg"])
  })

  it("numbers layers named alike from the second on, whatever their case", () => {
    const files = exportFiles(["Card", "card", "Card", "Lede"], [{ format: "png", scale: 2 }])
    expect(files.map((file) => file.name)).toEqual(["Card@2x.png", "card 2@2x.png", "Card 3@2x.png", "Lede@2x.png"])
    expect(files.map((file) => file.layer)).toEqual([0, 1, 2, 3])
  })

  it("writes a size asked for twice once", () => {
    const files = exportFiles(
      ["Logo"],
      [
        { format: "jpg", scale: 1 },
        { format: "jpg", scale: 1 }
      ]
    )

    expect(files.map((file) => file.name)).toEqual(["Logo.jpg"])
  })

  it("offers the next size not asked for: PNGs from 1x up, then JPGs, then none", () => {
    expect(nextExportSize([{ format: "png", scale: 2 }])).toEqual({ format: "png", scale: 1 })
    const pngs = [1, 2, 3].map((scale) => ({ format: "png" as const, scale: scale as 1 | 2 | 3 }))
    expect(nextExportSize(pngs)).toEqual({ format: "jpg", scale: 1 })
    const every = [...pngs, ...pngs.map((size) => ({ ...size, format: "jpg" as const }))]
    expect(nextExportSize(every)).toBeUndefined()
  })

  it("makes a name safe for a file on every system", () => {
    expect(safeName(' Plans / pricing: "Pro"? ')).toBe("Plans pricing Pro")
    expect(safeName("Version 2.")).toBe("Version 2")
    expect(safeName("Tab\there")).toBe("Tab here")
    expect(safeName("///")).toBe("Layer")
  })

  it("lists a few files, then how many more", () => {
    const files = exportFiles(["A", "B", "C", "D", "E"], [{ format: "png", scale: 2 }])
    expect(describeFiles(files)).toBe("A@2x.png, B@2x.png, C@2x.png and 2 more")
    expect(describeFiles(files.slice(0, 2))).toBe("A@2x.png, B@2x.png")
  })
})

describe("where each exported file comes from", () => {
  const frames = [
    {
      design: "pricing",
      scale: 2,
      width: 1280,
      height: 900,
      nodes: [
        { id: "headline", x: 100.25, y: 40, width: 300, height: 48 },
        { id: "hidden", x: 0, y: 0, width: 0, height: 0 }
      ]
    },
    { design: "pricing", scale: 1, width: 1280, height: 900, nodes: [] }
  ]

  it("cuts a layer from its design's frame at the file's scale, covering every pixel it touches", () => {
    const files = exportFiles(["Headline"], [{ format: "png", scale: 2 }])
    expect(planExport([{ design: "pricing", node: "headline" }], files, frames)).toEqual([
      { file: files[0], frame: 0, crop: { left: 200, top: 80, width: 601, height: 96 } }
    ])
  })

  it("takes the whole frame for a design", () => {
    const files = exportFiles(["Pricing"], [{ format: "jpg", scale: 1 }])
    expect(planExport([{ design: "pricing" }], files, frames)[0]).toMatchObject({
      frame: 1,
      crop: { left: 0, top: 0, width: 1280, height: 900 }
    })
  })

  it("says why a file can't be written: no frame, a layer not drawn, or one with no size", () => {
    const sizes = [{ format: "png" as const, scale: 2 as const }]
    const files = exportFiles(["Gone", "Missing", "Hidden"], sizes)

    const plan = planExport(
      [{ design: "deleted" }, { design: "pricing", node: "missing" }, { design: "pricing", node: "hidden" }],
      files,
      frames
    )

    expect(plan.map((entry) => entry.problem)).toEqual([
      "Gone@2x.png: its design didn't draw",
      "Missing@2x.png: the layer isn't drawn in the state the canvas shows",
      "Hidden@2x.png: the layer has no size"
    ])
  })

  it("keeps a crop inside the picture", () => {
    expect(pictureCrop({ x: -10, y: 880, width: 50, height: 40 }, { width: 100, height: 900, scale: 1 })).toEqual({
      left: 0,
      top: 880,
      width: 40,
      height: 20
    })
    expect(pictureCrop({ x: 200, y: 0, width: 10, height: 10 }, { width: 100, height: 100, scale: 1 })).toBeUndefined()
  })
})

describe("a selection copied as one picture", () => {
  const pricing = {
    design: "pricing",
    scale: 2,
    width: 1280,
    height: 900,
    nodes: [
      { id: "headline", x: 100.25, y: 40, width: 300, height: 48 },
      { id: "button", x: 100, y: 200, width: 120, height: 40 },
      { id: "hidden", x: 0, y: 0, width: 0, height: 0 }
    ]
  }

  const card = { design: "card", scale: 2, width: 320, height: 200, nodes: [] }
  const at = { x: 0, y: 0 }

  it("is exactly what exporting one layer as a PNG at 2x writes", () => {
    const files = exportFiles(["Headline"], [{ format: "png", scale: copyScale }])
    const [exported] = planExport([{ design: "pricing", node: "headline" }], files, [pricing])
    const plan = planPicture([{ design: "pricing", node: "headline", name: "Headline", at }], [pricing], copyScale)
    expect(plan.pieces).toEqual([{ frame: exported!.frame, crop: exported!.crop, left: 0, top: 0 }])
    expect(plan).toMatchObject({ width: exported!.crop!.width, height: exported!.crop!.height, problems: [] })
  })

  it("takes the box around a design's selected layers, with what's between them", () => {
    const plan = planPicture(
      [
        { design: "pricing", node: "headline", name: "Headline", at },
        { design: "pricing", node: "button", name: "Button", at }
      ],
      [pricing],
      copyScale
    )

    expect(plan.pieces).toEqual([{ frame: 0, crop: { left: 200, top: 80, width: 601, height: 400 }, left: 0, top: 0 }])
  })

  it("places designs as they sit on the canvas, in the box around them", () => {
    const plan = planPicture(
      [
        { design: "pricing", name: "Pricing", at: { x: 400, y: 100 } },
        { design: "card", name: "Card", at: { x: 0, y: 1100 } }
      ],
      [pricing, card],
      copyScale
    )

    expect(plan.pieces.map(({ frame, left, top }) => ({ frame, left, top }))).toEqual([
      { frame: 0, left: 800, top: 0 },
      { frame: 1, left: 0, top: 2000 }
    ])
    expect(plan).toMatchObject({ width: 800 + 2560, height: 2000 + 400 })
  })

  it("leaves out what can't be drawn and says why", () => {
    const plan = planPicture(
      [
        { design: "pricing", node: "missing", name: "Missing", at },
        { design: "pricing", node: "button", name: "Button", at },
        { design: "deleted", name: "Gone", at }
      ],
      [pricing],
      copyScale
    )

    expect(plan.pieces).toHaveLength(1)
    expect(plan.problems).toEqual([
      "Missing: the layer isn't drawn in the state the canvas shows",
      "Gone: its design didn't draw"
    ])
  })

  it("is nothing, and says so, when it's too big to copy", () => {
    const far = { x: largestPicture, y: 0 }

    const plan = planPicture(
      [
        { design: "pricing", name: "Pricing", at },
        { design: "card", name: "Card", at: far }
      ],
      [pricing, card],
      copyScale
    )

    expect(plan).toEqual({
      width: 0,
      height: 0,
      pieces: [],
      problems: ["At 2x it's over 16,384 pixels wide or tall, too big to copy. Select less, or export it."]
    })
  })

  it("is empty when nothing has a size", () => {
    expect(planPicture([{ design: "pricing", node: "hidden", name: "Hidden", at }], [pricing], copyScale)).toEqual({
      width: 0,
      height: 0,
      pieces: [],
      problems: ["Hidden: the layer has no size"]
    })
  })
})
