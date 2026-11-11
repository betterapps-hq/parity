/*
 * The Media tab's wall (PAR-838): pictures in columns, each as tall as its own proportions make it, each going to
 * whichever column is shortest, so the columns stay level and adding one never moves the ones before it. Lengths are in
 * tile widths and gaps rather than pixels, since the panel's width is the view's to know: it turns them into CSS.
 */

/** How a wall is laid out: how many sit across, the space between them in pixels, and a tile's usual width. */
export interface WallLayout {
  across: number
  gap: number
  /** A tile's width in a panel at its usual width, in pixels, which is what weighs widths against gaps. */
  usual: number
}

/** A length down the wall: so many tile widths, and so many gaps. */
export interface Stretch {
  widths: number
  gaps: number
}

/** Where one of the wall's pictures sits. */
export interface WallSpot<Item> {
  item: Item
  /** Its column, from 0. */
  column: number
  /** How tall it is, in tile widths. */
  tallness: number
  /** What's above it in its column. */
  above: Stretch
}

/** A picture's size in pixels, and a video's length. */
export interface PictureSize {
  width: number
  height: number
  /** How long a video runs, in seconds. */
  seconds?: number
}

/** Where each picture sits on a wall, and how long the wall is. */
export interface PackedWall<Item> {
  spots: WallSpot<Item>[]
  height: Stretch
}

/** The proportions a picture takes on the wall before its size is known, and for a path with no file: a photo's. */
const usualTallness = 0.75

/** The widest strip and the tallest card a tile is, so one panorama or one long screenshot doesn't take the wall. */
const tallnessRange = { least: 0.5, most: 1.4 }

/** How tall a tile is for its width: its picture's own proportions, kept between a wide strip and a tall card. */
export function tallnessOf(size: PictureSize | undefined): number {
  if (!size || size.width <= 0 || size.height <= 0) {
    return usualTallness
  }

  return Math.min(tallnessRange.most, Math.max(tallnessRange.least, size.height / size.width))
}

/**
 * A picture's size fitted to a box, keeping its proportions, or none while its size isn't known. One smaller than the
 * box is shown at its own size unless it `grows`, as a vector can without blurring.
 */
export function fitPicture(box: PictureSize, size: PictureSize | undefined, grows = false): PictureSize | undefined {
  if (!size || size.width <= 0 || size.height <= 0) {
    return undefined
  }

  const fits = Math.min(box.width / size.width, box.height / size.height)
  const scale = grows ? fits : Math.min(1, fits)

  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
}

/** Where each picture sits, in the order given, and how long the wall is. */
export function packWall<Item>(
  items: readonly Item[],
  tallness: (item: Item) => number,
  layout: WallLayout
): PackedWall<Item> {
  const columns: Stretch[] = Array.from({ length: Math.max(1, layout.across) }, () => ({ widths: 0, gaps: 0 }))
  const lengthOf = ({ widths, gaps }: Stretch) => widths * layout.usual + gaps * layout.gap

  const spots = items.map((item): WallSpot<Item> => {
    let column = 0

    for (const [index, each] of columns.entries()) {
      if (lengthOf(each) < lengthOf(columns[column]!)) {
        column = index
      }
    }

    const above = columns[column]!
    const tall = tallness(item)
    columns[column] = { widths: above.widths + tall, gaps: above.gaps + 1 }

    return { item, column, tallness: tall, above }
  })

  const longest = columns.reduce((longer, each) => (lengthOf(each) > lengthOf(longer) ? each : longer))

  // The gap under the last picture of the longest column isn't part of the wall.
  return { spots, height: { widths: longest.widths, gaps: Math.max(0, longest.gaps - 1) } }
}
