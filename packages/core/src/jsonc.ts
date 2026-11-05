/** Parses JSON with comments and trailing commas, as tsconfig files allow. Comment markers inside strings are kept. */
export function parseJsonc(text: string): unknown {
  let output = ""
  let index = 0
  while (index < text.length) {
    const char = text[index]!
    if (char === '"') {
      const start = index++
      while (index < text.length && text[index] !== '"') index += text[index] === "\\" ? 2 : 1
      output += text.slice(start, ++index)
    } else if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index++
    } else if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2)
      index = end === -1 ? text.length : end + 2
    } else {
      output += char
      index++
    }
  }
  return JSON.parse(output.replace(/,(\s*[}\]])/g, "$1"))
}
