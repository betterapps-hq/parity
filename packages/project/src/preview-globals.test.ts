import { describe, expect, it } from "vite-plus/test"
import { readPreviewGlobals } from "./preview-globals.ts"

describe("the preview file's global types (PAR-105)", () => {
  it("reads named exports, with options as strings or { value, title }, starting at initialGlobals", () => {
    const text = `
      import type { Preview } from "@storybook/react"

      export const globalTypes = {
        theme: {
          description: "Theme",
          defaultValue: "light",
          toolbar: { title: "Theme", items: ["light", "dark"] }
        },
        locale: {
          description: "Language",
          toolbar: {
            items: [
              { value: "en", title: "English", right: "🇺🇸" },
              { value: "ar", title: "العربية" }
            ]
          }
        }
      } satisfies Preview["globalTypes"]

      export const initialGlobals = { locale: "ar" }
    `

    expect(readPreviewGlobals(".parity/preview.tsx", text)).toEqual([
      { id: "theme", name: "Theme", options: [{ id: "light" }, { id: "dark" }], initial: "light" },
      {
        id: "locale",
        name: "Language",
        options: [
          { id: "en", name: "English" },
          { id: "ar", name: "العربية" }
        ],
        initial: "ar"
      }
    ])
  })

  it("reads the default export's properties: an object, a const it names, or what definePreview is given", () => {
    const declared = `
      const locales = ["en", "de"]
      const globalTypes = { locale: { toolbar: { items: locales } } }
    `

    const forms = [
      `${declared} export default { globalTypes }`,
      `${declared} const preview: Preview = { globalTypes }; export default preview`,
      `${declared} export default definePreview({ globalTypes, decorators: [withTheme] })`
    ]

    for (const text of forms) {
      expect(readPreviewGlobals(".parity/preview.tsx", text)).toEqual([
        { id: "locale", name: undefined, options: [{ id: "en" }, { id: "de" }], initial: undefined }
      ])
    }
  })

  it("passes over a global without items, and one the file computes as it runs", () => {
    const text = `
      export const globalTypes = {
        backgrounds: { description: "Background" },
        locale: { toolbar: { items: Object.keys(messages) } },
        theme: { toolbar: { items: ["light", themeName()] } }
      }
    `

    expect(readPreviewGlobals(".parity/preview.jsx", text)).toEqual([
      { id: "theme", name: undefined, options: [{ id: "light" }], initial: undefined }
    ])
  })

  it("is nothing for a file without global types", () => {
    expect(readPreviewGlobals(".parity/preview.tsx", "export const decorators = []")).toEqual([])
    expect(readPreviewGlobals(".parity/preview.tsx", "export const globalTypes = makeTypes()")).toEqual([])
  })
})
