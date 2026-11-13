/** A box to lay out: its key and its size. */
export interface PackedBox {
  key: string
  width: number
  height: number
}

/** How far apart packed boxes are: across, between boxes in a row, and down, between rows. */
export interface PackGaps {
  column: number
  row: number
}

/**
 * Rows of boxes laid out from `origin`, their top left: each row's boxes left to right with `gaps.column` between them,
 * and each row below the last, as far down as its tallest box and `gaps.row`, as story boards are laid out once their
 * sizes are known. Each box's top left, by its key.
 */
export function packRows(
  rows: readonly (readonly PackedBox[])[],
  origin: { x: number; y: number },
  gaps: PackGaps
): Map<string, { x: number; y: number }> {
  const placed = new Map<string, { x: number; y: number }>()
  let y = origin.y

  for (const row of rows) {
    let x = origin.x

    for (const box of row) {
      placed.set(box.key, { x, y })
      x += box.width + gaps.column
    }

    y += Math.max(0, ...row.map((box) => box.height)) + gaps.row
  }

  return placed
}
