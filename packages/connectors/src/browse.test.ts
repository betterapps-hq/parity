import { describe, expect, it } from "vite-plus/test"
import {
  choose,
  countOf,
  depthOf,
  fieldLabel,
  isPlaceable,
  kindFor,
  labelOf,
  layoutFor,
  mayHaveMore,
  narrowedBy,
  nounFor,
  otherSide,
  pageSizeFor,
  pictureCredit,
  requestFor,
  setPastView,
  shownFilters,
  sizeOf
} from "./browse.ts"
import { mobbin } from "./mobbin.ts"
import { pixabay } from "./pixabay.ts"
import { unsplash } from "./unsplash.ts"

const ids = (filters: readonly { id: string }[]) => filters.map(({ id }) => id)

describe("shownFilters", () => {
  it("leaves depth out, since the browser offers it as Search deeper", () => {
    expect(ids(shownFilters(mobbin.info))).toEqual(["platform"])
  })

  it("draws a filter only where it applies", () => {
    expect(ids(shownFilters(pixabay.info))).toContain("orientation")
    expect(ids(shownFilters(pixabay.info, { type: "videos" }))).not.toContain("orientation")
  })
})

describe("choose", () => {
  it("sets one filter and keeps the rest", () => {
    expect(choose(pixabay.info, { orientation: "horizontal" }, "type", "vectors")).toEqual({
      orientation: "horizontal",
      type: "vectors"
    })
  })

  it("takes away what a choice makes not apply", () => {
    expect(choose(pixabay.info, { orientation: "horizontal", color: "red" }, "type", "videos")).toEqual({
      type: "videos"
    })
  })

  it("clears a filter given no value", () => {
    expect(choose(unsplash.info, { orientation: "portrait" }, "orientation", undefined)).toEqual({})
  })
})

describe("setPastView", () => {
  it("counts the filters behind Filters that are set away from their default", () => {
    const [, , , ...past] = shownFilters(pixabay.info)
    const [first] = past

    expect(setPastView(pixabay.info, {})).toBe(0)
    expect(first && setPastView(pixabay.info, { [first.id]: first.values[0].id })).toBe(1)
  })
})

describe("kindFor", () => {
  it("is what a filter's value names, or the first kind the connector finds", () => {
    expect(kindFor(pixabay.info, {})).toBe("photos")
    expect(kindFor(pixabay.info, { type: "videos" })).toBe("videos")
    expect(kindFor(mobbin.info, { platform: "ios" })).toBe("screens")
  })
})

describe("layoutFor and sizeOf", () => {
  it("packs pictures into columns and lays screens in rows", () => {
    expect(layoutFor("photos")).toBe("columns")
    expect(layoutFor("videos")).toBe("columns")
    expect(layoutFor("screens")).toBe("rows")
  })

  it("takes a result's own size, or its platform's usual one", () => {
    expect(sizeOf({ image: { url: "https://a.test/1.jpg", width: 600, height: 400 } })).toEqual({
      width: 600,
      height: 400
    })
    expect(sizeOf({ image: { url: "https://a.test/1.jpg" }, platform: "ios" })).toEqual({ width: 390, height: 844 })
  })
})

describe("requestFor", () => {
  const searched = { query: "pricing page", filters: { platform: "ios" } }

  it("asks for a page that fills the rows, with depth at its default", () => {
    expect(requestFor(mobbin.info, searched)).toEqual({
      query: "pricing page",
      kind: "screens",
      limit: 12,
      filters: { platform: "ios", depth: "standard" }
    })
    expect(requestFor(mobbin.info, { ...searched, deep: true }).filters).toEqual({ platform: "ios", depth: "deep" })
  })

  it("asks for more by leaving out what's shown, or by page, as the connector gives more", () => {
    const shown = Array.from({ length: 12 }, (_, index) => ({ id: String(index) }))

    expect(requestFor(mobbin.info, searched, shown.slice(0, 2)).exclude).toEqual(["0", "1"])
    expect(requestFor(pixabay.info, { query: "lake", filters: {} }, shown).page).toBe(2)
  })

  it("asks Pixabay for videos when its type is videos", () => {
    expect(requestFor(pixabay.info, { query: "waves", filters: { type: "videos" } }).kind).toBe("videos")
  })

  it("asks for a dozen pictures, or as many as the connector allows", () => {
    expect(pageSizeFor(pixabay.info, {})).toBe(12)
    expect(pageSizeFor(mobbin.info, {})).toBe(9)
  })
})

describe("mayHaveMore", () => {
  it("expects more only after a full page", () => {
    expect(mayHaveMore(12, { limit: 12 })).toBe(true)
    expect(mayHaveMore(5, { limit: 12 })).toBe(false)
  })
})

describe("nounFor, fieldLabel and countOf", () => {
  it("names what's found by the type chosen, or by kind", () => {
    expect(nounFor(pixabay.info, { type: "illustrations" })).toEqual({ one: "illustration", many: "illustrations" })
    expect(nounFor(mobbin.info, {})).toEqual({ one: "screen", many: "screens" })
    expect(fieldLabel(pixabay.info, { type: "illustrations" })).toBe("Describe an illustration")
    expect(fieldLabel(pixabay.info, {})).toBe("Describe a photo")
    expect(countOf(1, nounFor(mobbin.info, {}))).toBe("1 screen")
  })
})

describe("narrowedBy and otherSide", () => {
  it("lists a filter that always has a value, and any other chosen", () => {
    expect(narrowedBy(mobbin.info, {}).map(({ name }) => name)).toEqual(["Web"])
    expect(narrowedBy(unsplash.info, { orientation: "portrait" }).map(({ name }) => name)).toEqual(["Portrait"])
  })

  it("offers the other side of a switch between two when nothing matched", () => {
    expect(otherSide(mobbin.info, {})?.value.name).toBe("iOS")
    expect(otherSide(mobbin.info, { platform: "ios" })?.value.name).toBe("Web")
    expect(otherSide(unsplash.info, {})).toBeUndefined()
  })
})

describe("depthOf", () => {
  it("names a connector's quick and deep modes", () => {
    expect(depthOf(mobbin.info)).toEqual({ quick: "standard", deep: "deep" })
    expect(depthOf(pixabay.info)).toBeUndefined()
  })
})

describe("results", () => {
  const photo = { kind: "photos" as const, title: "Lake at dawn", credit: [{ name: "Ana" }, { name: "Pixabay" }] }

  it("names a picture by what it shows and who made it, and a screen by its app", () => {
    expect(labelOf(photo)).toBe("Lake at dawn, by Ana")
    expect(labelOf({ kind: "screens", title: "Pricing", credit: [{ name: "Linear" }] })).toBe("Linear")
  })

  it("lets photos and videos into the project and keeps screens out", () => {
    expect(isPlaceable(photo)).toBe(true)
    expect(isPlaceable({ kind: "videos" })).toBe(true)
    expect(isPlaceable({ kind: "screens" })).toBe(false)
  })
})

describe("pictureCredit", () => {
  it("credits who made a picture, at its own page, under its library's name", () => {
    const found = {
      link: "https://pixabay.com/photos/lake-1",
      credit: [{ name: "Ana", url: "https://pixabay.com/users/ana" }]
    }

    expect(pictureCredit(found, pixabay.info)).toEqual({
      name: "Ana",
      url: "https://pixabay.com/photos/lake-1",
      source: "Pixabay"
    })
    expect(pictureCredit({ ...found, credit: [] }, pixabay.info)).toBeUndefined()
  })
})
