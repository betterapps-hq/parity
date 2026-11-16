import type { Found, SearchAnswer } from "@parity-app/connectors"
import type { ConnectorSearch } from "../../shared/connectors.ts"
import signInDark from "./bitmaps/sign-in-desktop-dark.png?url"
import signInLight from "./bitmaps/sign-in-desktop-light.png?url"
import signInPhone from "./bitmaps/sign-in-mobile-light.png?url"

/*
 * Results for the library browser's stories (PAR-839), answered in place of the real connectors so a story shows the
 * same thing every time. Pictures are the ones drawn for stories and served at `/images/`; screens are the example's
 * sign-in screen. Every name is made up.
 */

/** A story picture's address, as a result links to it. */
const at = (file: string) => new URL(`/images/${file}`, location.href).href

interface Picture {
  file: string
  title: string
  by: string
  width: number
  height: number
}

const photos: Picture[] = [
  { file: "dusk-hills.jpg", title: "Hills at dusk", by: "Lena Ray", width: 900, height: 600 },
  { file: "desk-from-above.jpg", title: "Desk from above", by: "Omar Haddad", width: 900, height: 600 },
  { file: "plant.jpg", title: "Potted palm", by: "Mia Torres", width: 600, height: 860 },
  { file: "coast.jpg", title: "Coast at noon", by: "Lena Ray", width: 1500, height: 500 },
  { file: "team.jpg", title: "Team at a table", by: "Sam Okafor", width: 960, height: 540 },
  { file: "pattern.png", title: "Shapes pattern", by: "Jun Park", width: 480, height: 480 }
]

const vectors: Picture[] = [
  { file: "logo.svg", title: "Letter mark", by: "Jun Park", width: 64, height: 64 },
  { file: "wave.svg", title: "Waves and sun", by: "Mia Torres", width: 400, height: 240 }
]

/** A Pixabay picture as its connector gives one, by a copy number so pages after the first bring new ids. */
function picture({ file, title, by, width, height }: Picture, copy: number): Found {
  const id = `${file.replace(/\.\w+$/, "")}-${copy}`

  return {
    connector: "pixabay",
    id,
    kind: "photos",
    title,
    image: { url: at(file), width, height },
    link: `https://pixabay.com/photos/${id}/`,
    credit: [{ name: by, url: `https://pixabay.com/users/${by.toLowerCase().replace(" ", "-")}/` }, { name: "Pixabay" }]
  }
}

/** A Pixabay video: its picture is its poster, and every one plays the stories' 12-second clip. */
function clip(source: Picture, copy: number): Found {
  return {
    ...picture(source, copy),
    kind: "videos",
    video: { url: at("sample-clip.mp4"), duration: 18 + copy, width: 1280, height: 720 }
  }
}

/** How many pages a picture search has: a full one, then part of one. */
const pages = 2

/** Pixabay's answer: pictures of the type chosen, a dozen a page, two pages, and nothing for "qwerty". */
function pixabayAnswer({ request }: ConnectorSearch): SearchAnswer {
  if (request.query.toLowerCase().includes("qwerty")) {
    return { found: [] }
  }

  const page = request.page ?? 1
  const limit = request.limit ?? 12
  const type = request.filters?.type ?? "photos"
  const source = type === "vectors" ? vectors : photos
  const make = type === "videos" ? clip : picture
  const count = page < pages ? limit : Math.ceil(limit / 2)

  if (page > pages) {
    return { found: [] }
  }

  return {
    found: Array.from({ length: count }, (_, index) => {
      const number = (page - 1) * limit + index

      return make(source[number % source.length]!, number)
    })
  }
}

const apps = ["Ledgerly", "Budgetbird", "Northwind", "Plotline"]

/** A Mobbin screen as its connector gives one: an app's sign-in, on the web or a phone. */
function screen(app: string, index: number, platform: "web" | "ios"): Found {
  const id = `${app.toLowerCase()}-${platform}-${index}`
  const desktop = index % 2 === 0 ? signInLight : signInDark
  const url = platform === "ios" ? signInPhone : desktop

  return {
    connector: "mobbin",
    id,
    kind: "screens",
    title: `${app} sign in`,
    platform,
    image: { url: new URL(url, location.href).href },
    link: `https://mobbin.com/screens/${id}`,
    credit: [{ name: app }, { name: "Mobbin" }]
  }
}

/** Mobbin's answer: a page of sign-in screens on the platform chosen, and nothing for "nothing". */
function mobbinAnswer({ request }: ConnectorSearch): SearchAnswer {
  if (request.query.toLowerCase().includes("nothing")) {
    return { found: [] }
  }

  const platform = request.filters?.platform === "ios" ? "ios" : "web"
  const shown = request.exclude?.length ?? 0
  const count = shown > 0 ? 3 : (request.limit ?? 9)

  return {
    found: Array.from({ length: count }, (_, index) =>
      screen(apps[(shown + index) % apps.length]!, shown + index, platform)
    )
  }
}

/** Every story library's answer, by connector, as `answeringSearches` takes it. */
export function storyResults(search: ConnectorSearch): SearchAnswer {
  if (search.connector === "mobbin") {
    return mobbinAnswer(search)
  }

  // Unsplash's photos are Pixabay's, credited to Unsplash.
  const answer = pixabayAnswer(search)

  return "found" in answer
    ? { found: answer.found.map((found) => ({ ...found, connector: search.connector })) }
    : answer
}
