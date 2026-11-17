import type { CssDeclaration, WrittenClasses } from "@parity-app/extension"
import type { StylePrinter } from "@parity-app/extension/styles"

/** Tailwind writing a layer's declarations as classes, and compiling classes as the project's build does. */
export interface ClassPrinter extends StylePrinter<string[]> {
  /**
   * The CSS these classes compile to in this project, as one stylesheet in Tailwind's own cascade layer and order, so
   * a frame that gives its elements the classes draws them as the project's built CSS would (PAR-942). A class
   * Tailwind doesn't know compiles to nothing.
   */
  css(classes: readonly string[]): string
}

/**
 * The classes Tailwind writes for each declaration, one declaration at a time, since a frame draws a layer by classes
 * only when every one of its declarations has them. The CSS is compiled for them together with `written`, the classes
 * the frames already have, so the frames' stylesheet of classes is always whole, in Tailwind's own order.
 */
export function writeClasses(
  printer: ClassPrinter,
  written: readonly string[],
  declarations: readonly CssDeclaration[]
): WrittenClasses {
  const classes = declarations.map((declaration) => {
    const { output, unwritten } = printer.print([declaration])

    return unwritten.length > 0 || output.length === 0 ? null : output
  })

  const names = new Set([...written, ...classes.flatMap((names) => names ?? [])])

  return { classes, css: printer.css([...names]) }
}
