// Draws the app's icons from the drawings in /brand: icon.ico for Windows, icon.png for Linux, and dock.png for the
// macOS dock. Run it after changing a drawing. It draws in Microsoft Edge.
// Usage: node scripts/icons.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { chromium } from "playwright-core"

const brandDir = resolve(import.meta.dirname, "../../../brand")
const outDir = resolve(import.meta.dirname, "../resources")
const full = readFileSync(join(brandDir, "parity-icon.svg"), "utf8")
// Drawn for small sizes, with heavier lines and no glow.
const small = readFileSync(join(brandDir, "parity-icon-small.svg"), "utf8")

interface Drawn {
  size: number
  png: Buffer
  /** Top row first, in RGBA. */
  pixels: Buffer
}

const browser = await chromium.launch({ channel: "msedge" })
try {
  const page = await browser.newPage()

  /** Draws an icon at a size, inside a margin on each side. */
  const draw = async (svg: string, size: number, margin = 0): Promise<Drawn> => {
    // Drawn at the size it's shown, rather than scaled from the size its file gives.
    const inner = size - margin * 2
    const source = svg.replace(/ width="\d+" height="\d+"/, ` width="${inner}" height="${inner}"`)
    const drawn = await page.evaluate(
      async ({ source, size, margin }) => {
        const image = new Image()
        image.src = `data:image/svg+xml,${encodeURIComponent(source)}`
        await image.decode()
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext("2d")!
        if (margin > 0) {
          // The soft shadow under the dock's other icons.
          context.shadowColor = "rgba(0, 0, 0, 0.3)"
          context.shadowBlur = size / 50
          context.shadowOffsetY = size / 100
        }
        context.drawImage(image, margin, margin)
        let pixels = ""
        for (const byte of context.getImageData(0, 0, size, size).data) pixels += String.fromCharCode(byte)
        return { png: canvas.toDataURL("image/png").split(",")[1], pixels: btoa(pixels) }
      },
      { source, size, margin }
    )
    return { size, png: Buffer.from(drawn.png, "base64"), pixels: Buffer.from(drawn.pixels, "base64") }
  }

  // Windows picks the size nearest to each place it shows the icon: the title bar, the taskbar, File Explorer. The
  // taskbar shrinks what it picks, 32 to 24 pixels and 40 to 30, so those take the small drawing too.
  const sizes: Drawn[] = []
  for (const size of [16, 20, 24, 32, 40, 48, 64, 256]) sizes.push(await draw(size <= 40 ? small : full, size))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, "icon.ico"), ico(sizes))
  writeFileSync(join(outDir, "icon.png"), (await draw(full, 512)).png)
  // macOS draws app icons inside a margin, so each stands at the same size in the dock: 100 of 1024 on each side.
  writeFileSync(join(outDir, "dock.png"), (await draw(full, 512, 50)).png)
  console.log(outDir)
} finally {
  await browser.close()
}

/**
 * An icon file holding every size: 256 as a PNG, and the smaller sizes as bitmaps, which every program that reads icons
 * can show.
 */
function ico(sizes: Drawn[]): Buffer {
  const images = sizes.map(({ size, png, pixels }) => (size >= 256 ? png : bitmap(size, pixels)))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach(({ size }, index) => {
    const entry = 6 + index * 16
    // A width and height of 0 mean 256.
    header.writeUInt8(size % 256, entry)
    header.writeUInt8(size % 256, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[index].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[index].length
  })
  return Buffer.concat([header, ...images])
}

/** A size as an icon file keeps a bitmap: bottom row first, in BGRA, then a mask that's set where it's transparent. */
function bitmap(size: number, pixels: Buffer): Buffer {
  const maskRow = Math.ceil(size / 32) * 4
  const colors = 40
  const mask = colors + size * size * 4
  const data = Buffer.alloc(mask + maskRow * size)
  data.writeUInt32LE(40, 0)
  data.writeInt32LE(size, 4)
  // Twice the height: the colors, then the mask.
  data.writeInt32LE(size * 2, 8)
  data.writeUInt16LE(1, 12)
  data.writeUInt16LE(32, 14)
  data.writeUInt32LE(data.length - colors, 20)
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4
      const to = colors + (row * size + x) * 4
      data[to] = pixels[from + 2]
      data[to + 1] = pixels[from + 1]
      data[to + 2] = pixels[from]
      data[to + 3] = pixels[from + 3]
      if (pixels[from + 3] === 0) data[mask + row * maskRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return data
}
