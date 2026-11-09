import { describe, expect, it } from "vite-plus/test"
import type { Load, LiveObject } from "./live.ts"
import { presets } from "./presets.ts"

/** A load that answers with these modules, as a project with them installed would. */
function modules(answers: { [specifier: string]: LiveObject }): Load {
  return async (specifier) => answers[specifier] ?? Promise.reject(new Error(`no ${specifier}`))
}

describe("theme objects", () => {
  it("names the field MUI's theme no longer has", async () => {
    const theme = presets.get("@mui/material")!.theme!
    await expect(theme(modules({ "@mui/material/styles": {} }))).rejects.toThrow(
      "@mui/material/styles: /createTheme: expected a function"
    )
    const createTheme = () => ({ generateStyleSheets: () => [], typography: {} })
    await expect(theme(modules({ "@mui/material/styles": { createTheme } }))).rejects.toThrow(
      "MUI's createTheme(): /breakpoints: expected an object"
    )
  })

  it("reads MUI's variables, type scale and breakpoints", async () => {
    const createTheme = () => ({
      generateStyleSheets: () => [
        { ":root": { "--mui-spacing": "8px" } },
        { ".dark": { "--mui-palette-text": "#fff" } }
      ],
      breakpoints: { values: { xs: 0, sm: 600 } },
      typography: { fontSize: 14, h1: { fontSize: "6rem", lineHeight: 1.167 } }
    })

    const read = await presets.get("@mui/material")!.theme!(modules({ "@mui/material/styles": { createTheme } }))
    expect(read.breakpoints).toEqual([{ id: "sm", name: expect.any(String), width: 600 }])
    expect(read.tokens.map((token) => token.var)).toEqual(
      expect.arrayContaining(["mui-spacing", "mui-palette-text", "spacing", "mui-font-size-h1", "mui-line-height-h1"])
    )
  })

  it("names the field Chakra's default system no longer has", async () => {
    const theme = presets.get("@chakra-ui/react")!.theme!
    await expect(theme(modules({ "@chakra-ui/react": { defaultSystem: {} } }))).rejects.toThrow(
      "@chakra-ui/react: /defaultSystem/getTokenCss: expected a function"
    )
    const defaultSystem = { getTokenCss: () => "--chakra-colors-bg: white" }
    await expect(theme(modules({ "@chakra-ui/react": { defaultSystem } }))).rejects.toThrow(
      "Chakra's getTokenCss(): /: expected an object"
    )
  })
})
