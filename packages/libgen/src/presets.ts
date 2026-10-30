import type { LibraryDecorator, LibraryIcons } from "@parity-app/core"
import type { ExampleHints } from "./examples.ts"
import type { IconTagSource } from "./icon-tags.ts"
import type { CollectedToken } from "./tokens.ts"

/** Loads a module the way the project would: from the project's own `node_modules`. */
export type Load = (specifier: string) => Promise<Record<string, unknown>>

/** What a theme object holds, read by running the library's own code at generation time. */
export interface ThemeTokens {
  tokens: CollectedToken[]
  breakpoints?: { id: string; name: string; width: number }[]
}

/**
 * What Parity knows about a library that its types and CSS can't say: its name, which providers its components need
 * (written as data-only decorators), where its theme object is, and how its icons are drawn. Detection still does the
 * work; a preset only fills what can't be detected.
 */
export interface Preset {
  id: string
  name: string
  description: string
  /** Its stylesheet, relative to the package, when it has one a project imports. */
  styles?: string
  /** The module components are imported from, when it isn't the package itself. */
  components?: string
  decorators?: LibraryDecorator[]
  /** Reads the tokens of a theme object, for libraries that keep them in JavaScript. */
  theme?: (load: Load) => Promise<ThemeTokens>
  icons?: Partial<LibraryIcons>
  /** Where an icon set publishes its tags, read into its file each time it's generated. */
  tags?: IconTagSource
  /** Why something it needs isn't a decorator yet, for the report. */
  notes?: string[]
  /** Where its examples and stories are, when its repository has other components' too. */
  examples?: ExampleHints
}

const createTheme = { import: "@mui/material/styles", export: "createTheme" }

/** MUI's theme in CSS-variables mode, so its components read the custom properties the Tokens panel edits. */
function muiTheme(mode: "light" | "dark") {
  return {
    $call: createTheme,
    args: [
      {
        cssVariables: { rootSelector: ":host", colorSchemeSelector: "class" },
        colorSchemes: { light: true, dark: true },
        defaultColorScheme: mode,
        // Popups render into the frame, not the page's body, so they pick up its styles and theme.
        components: Object.fromEntries(
          ["MuiPopover", "MuiPopper", "MuiModal"].map((name) => [
            name,
            { defaultProps: { container: { $frame: "body" } } }
          ])
        )
      }
    ]
  }
}

const fluentThemes = {
  light: "webLightTheme",
  dark: "webDarkTheme",
  "teams-light": "teamsLightTheme",
  "teams-dark": "teamsDarkTheme",
  "teams-high-contrast": "teamsHighContrastTheme"
}

/** Buildkit's shadcn styles on Base UI: the same components and providers, styled differently. */
export const buildkitStyles = ["luma", "lyra", "maia", "mira", "nova", "rhea", "sera", "vega"] as const

const buildkit = Object.fromEntries(
  buildkitStyles.map((style): [string, Preset] => {
    const name = `@buildkitgg/shadcn-baseui-${style}`
    return [
      name,
      {
        id: style,
        name: `Shadcn ${style.charAt(0).toUpperCase()}${style.slice(1)}`,
        description: `Every shadcn component on Base UI, in the ${style} style, kept in step with upstream.`,
        styles: "tailwind.css",
        examples: { paths: ["apps/v4/examples/base/"], anatomy: ["apps/v4/content/docs/components/base/"] },
        decorators: [
          { wrap: { import: name, component: "TooltipProvider" } },
          { add: { import: name, component: "Toaster" } }
        ]
      }
    ]
  })
)

export const presets: Record<string, Preset> = {
  ...buildkit,
  "radix-ui": {
    examples: { paths: ["apps/storybook/stories/"] },
    id: "radix",
    name: "Radix Primitives",
    description: "Unstyled, accessible primitives; styles come from the project's CSS.",
    decorators: [
      { wrap: { import: "radix-ui", component: "Direction.Provider", props: { dir: { $frame: "dir" } } } },
      { wrap: { import: "radix-ui", component: "Tooltip.Provider" } },
      { wrap: { import: "radix-ui", component: "Toast.Provider" } },
      { add: { import: "radix-ui", component: "Toast.Viewport" } }
    ],
    notes: [
      "Portals take a container per component (`Dialog.Portal container`); Radix has no provider for all of them."
    ]
  },
  "@base-ui/react": {
    examples: { paths: ["docs/"], anatomy: ["docs/src/app/(docs)/react/components/"] },
    id: "baseui",
    name: "Base UI",
    description: "Unstyled components from the makers of Radix, Floating UI and Material UI.",
    decorators: [
      { wrap: { import: "@base-ui/react", component: "DirectionProvider", props: { direction: { $frame: "dir" } } } },
      { wrap: { import: "@base-ui/react", component: "Toast.Provider" } }
    ],
    notes: [
      "Portals take a container per component (`Dialog.Portal container`); Base UI has no provider for all of them."
    ]
  },
  "react-aria-components": {
    examples: { paths: ["packages/react-aria-components/", "packages/dev/s2-docs/pages/react-aria/"] },
    id: "aria",
    name: "React Aria Components",
    description: "Adobe's unstyled, accessible components; styles come from the project's CSS.",
    decorators: [
      { wrap: { import: "react-aria-components", component: "I18nProvider", props: { locale: { $frame: "lang" } } } }
    ],
    notes: ["Toasts need the app's own `UNSTABLE_ToastQueue`, so there's no toast host to add."]
  },
  "@mui/material": {
    examples: { paths: [], demos: ["docs/data/material/components/"] },
    id: "mui",
    name: "Material UI",
    description: "Google's Material Design in React, styled with Emotion.",
    decorators: [
      {
        wrap: {
          import: "@emotion/react",
          component: "CacheProvider",
          props: {
            value: {
              $call: { import: "@emotion/cache", export: "default" },
              args: [{ key: "mui", container: { $frame: "root" }, prepend: true }]
            }
          }
        }
      },
      {
        wrap: {
          import: "@mui/material/styles",
          component: "ThemeProvider",
          props: {
            theme: { $global: "theme", values: { dark: muiTheme("dark") }, default: muiTheme("light") },
            // The mode decides light or dark, not the system's setting, and nothing is kept in storage.
            defaultMode: { $global: "theme", values: { dark: "dark" }, default: "light" },
            colorSchemeNode: { $frame: "body" },
            storageManager: null,
            disableTransitionOnChange: true
          }
        }
      },
      { wrap: { import: "@mui/material", component: "ScopedCssBaseline" } }
    ],
    async theme(load) {
      const styles = await load("@mui/material/styles")
      const make = styles.createTheme as (options: unknown) => { generateStyleSheets(): Record<string, unknown>[] }
      const theme = make({ cssVariables: { colorSchemeSelector: "class" }, colorSchemes: { light: true, dark: true } })
      const tokens = new Map<string, CollectedToken>()
      for (const sheet of theme.generateStyleSheets()) {
        for (const [selector, declarations] of Object.entries(sheet)) {
          const context = /\bdark\b/.test(selector) ? "dark" : "default"
          for (const [name, value] of Object.entries(declarations as Record<string, unknown>)) {
            if (!name.startsWith("--") || (typeof value !== "string" && typeof value !== "number")) continue
            const property = name.slice(2)
            // Channels (`--mui-palette-primary-mainChannel: 25 118 210`) feed MUI's own colour maths.
            if (/Channel$|Opacity$/.test(property)) continue
            const token = tokens.get(property) ?? { var: property, category: muiCategory(property), values: {} }
            token.values[context] = String(value)
            tokens.set(property, token)
          }
        }
      }
      // Parity's spacing steps are multiples of `--spacing`; MUI's `spacing(1)` is the same step.
      const unit = tokens.get("mui-spacing")?.values.default
      if (unit) tokens.set("spacing", { var: "spacing", category: "spacing", values: { default: unit } })
      const plain = make({}) as unknown as {
        breakpoints: { values: Record<string, number> }
        typography: Record<string, unknown>
      }
      const breakpoints = plain.breakpoints.values
      // MUI's own variables hold whole `font` shorthands and no widths, so its type scale and breakpoints are declared
      // as tokens of their own, for Parity's type and breakpoint controls.
      for (const [id, width] of Object.entries(breakpoints)) {
        if (width > 0)
          tokens.set(`mui-breakpoint-${id}`, {
            var: `mui-breakpoint-${id}`,
            category: "breakpoint",
            values: { default: `${width}px` }
          })
      }
      for (const [variant, style] of Object.entries(plain.typography)) {
        const { fontSize, lineHeight } = (style ?? {}) as { fontSize?: unknown; lineHeight?: unknown }
        if (typeof fontSize !== "string") continue
        const size = `mui-font-size-${variant}`
        const leading = `mui-line-height-${variant}`
        if (typeof lineHeight === "number" || typeof lineHeight === "string") {
          tokens.set(leading, { var: leading, category: "leading", values: { default: String(lineHeight) } })
        }
        tokens.set(size, {
          var: size,
          category: "font-size",
          values: { default: fontSize },
          ...(tokens.has(leading) ? { lineHeight: leading } : {})
        })
      }
      return {
        tokens: [...tokens.values()],
        breakpoints: Object.entries(breakpoints)
          .filter(([, width]) => width > 0)
          .map(([id, width]) => ({ id, name: breakpointName(id), width }))
      }
    }
  },
  "@chakra-ui/react": {
    examples: { paths: ["apps/compositions/"], anatomy: ["apps/www/content/docs/components/"] },
    id: "chakra",
    name: "Chakra UI",
    description: "Accessible components with style props, on Emotion.",
    decorators: [
      {
        wrap: {
          import: "@emotion/react",
          component: "CacheProvider",
          props: {
            value: {
              $call: { import: "@emotion/cache", export: "default" },
              args: [{ key: "chakra", container: { $frame: "root" } }]
            }
          }
        }
      },
      {
        wrap: {
          import: "@chakra-ui/react",
          component: "ChakraProvider",
          props: { value: { $import: "@chakra-ui/react", export: "defaultSystem" } }
        }
      },
      // Chakra's own answer for shadow roots: focus, portals and measurements look inside the frame.
      {
        wrap: {
          import: "@chakra-ui/react",
          component: "EnvironmentProvider",
          props: { value: { $function: { $frame: "root" } } }
        }
      },
      // Chakra's global styles set the page's font and colors on `html, body`, which a frame's shadow root can't
      // match, so the frame's body takes them here. Its recipes are in cascade layers, so the cache appends rather
      // than prepends: the layer order Chakra declares has to come before the first recipe.
      {
        style: {
          "font-family": "var(--chakra-fonts-body)",
          color: "var(--chakra-colors-fg)",
          "background-color": "var(--chakra-colors-bg)",
          "line-height": "1.5"
        }
      }
    ],
    notes: [
      "Chakra's Toaster is a snippet the app generates (`npx @chakra-ui/cli snippet add toaster`), not an export."
    ],
    async theme(load) {
      const chakra = await load("@chakra-ui/react")
      const system = chakra.defaultSystem as { getTokenCss(): unknown; breakpoints?: { values?: unknown } }
      const tokens = new Map<string, CollectedToken>()
      const visit = (styles: unknown, context: string) => {
        if (typeof styles !== "object" || styles === null) return
        for (const [key, value] of Object.entries(styles as Record<string, unknown>)) {
          if (key.startsWith("--") && (typeof value === "string" || typeof value === "number")) {
            const property = key.slice(2)
            const token = tokens.get(property) ?? {
              var: property,
              category: chakraCategory(property, String(value)),
              values: {}
            }
            token.values[context] = String(value)
            tokens.set(property, token)
          } else visit(value, /\bdark\b/.test(key) ? "dark" : context)
        }
      }
      visit(system.getTokenCss(), "default")
      const unit = tokens.get("chakra-spacing-1")?.values.default
      if (unit) tokens.set("spacing", { var: "spacing", category: "spacing", values: { default: unit } })
      return { tokens: [...tokens.values()] }
    }
  },
  "@mantine/core": {
    examples: { paths: ["packages/@docs/demos/"] },
    id: "mantine",
    name: "Mantine",
    description: "A full-featured component library with CSS modules and its own hooks.",
    styles: "styles.css",
    decorators: [
      {
        wrap: {
          import: "@mantine/core",
          component: "MantineProvider",
          props: {
            forceColorScheme: { $global: "theme", values: { dark: "dark" }, default: "light" },
            // Mantine writes its variables and color scheme onto the frame's host rather than the page, where its
            // `:root[data-mantine-color-scheme]` rules, drawn as `:host(...)`, find them.
            cssVariablesSelector: ":host",
            getRootElement: { $function: { $frame: "host" } },
            theme: { components: { Portal: { defaultProps: { target: { $frame: "body" } } } } }
          }
        }
      }
    ],
    notes: [
      "`@mantine/notifications` has its own `Notifications` host; it's added once that package has a registry file."
    ]
  },
  "@fluentui/react-components": {
    examples: { paths: ["packages/react-components/"] },
    id: "fluent",
    name: "Fluent UI",
    description: "Microsoft's Fluent 2 design system for React, styled with Griffel.",
    decorators: [
      {
        wrap: {
          import: "@fluentui/react-components",
          component: "RendererProvider",
          props: {
            renderer: {
              $call: { import: "@griffel/shadow-dom", export: "createShadowDOMRenderer" },
              args: [{ $frame: "root" }]
            },
            targetDocument: { $frame: "document" }
          }
        }
      },
      {
        wrap: {
          import: "@fluentui/react-components",
          component: "FluentProvider",
          props: {
            theme: {
              $global: "theme",
              values: Object.fromEntries(
                Object.entries(fluentThemes).map(([id, name]) => [
                  id,
                  { $import: "@fluentui/react-components", export: name }
                ])
              ),
              default: { $import: "@fluentui/react-components", export: "webLightTheme" }
            },
            dir: { $frame: "dir" },
            targetDocument: { $frame: "document" }
          }
        }
      },
      // Menus, popovers and dialogs mount into the frame, where its styles and theme are.
      {
        wrap: {
          import: "@fluentui/react-components",
          component: "PortalMountNodeProvider",
          props: { value: { $frame: "body" } }
        }
      }
    ],
    notes: [
      "FluentProvider writes its theme into the page's head, which frames can't see, so each theme's variables come from this file's tokens."
    ],
    async theme(load) {
      const fluent = await load("@fluentui/tokens")
      const tokens = new Map<string, CollectedToken>()
      for (const [context, name] of Object.entries(fluentThemes)) {
        const theme = fluent[name] as Record<string, string | number> | undefined
        if (!theme) continue
        for (const [property, value] of Object.entries(theme)) {
          const token = tokens.get(property) ?? { var: property, category: fluentCategory(property), values: {} }
          if (context === "light") token.values.default = String(value)
          else token.values[context] = String(value)
          tokens.set(property, token)
        }
      }
      // A size and the line height with the same step go together: fontSizeBase300 with lineHeightBase300.
      for (const token of tokens.values()) {
        const step = /^fontSize(.+)$/.exec(token.var)?.[1]
        if (step && tokens.has(`lineHeight${step}`)) token.lineHeight = `lineHeight${step}`
      }
      return { tokens: [...tokens.values()] }
    }
  },
  recharts: {
    id: "recharts",
    name: "Recharts",
    description: "Charts, axes, series and grids to compose, as shadcn's charts are."
  },
  "lucide-react": {
    id: "lucide",
    name: "Lucide",
    description: "Over 1,600 consistent, open source icons; shadcn's default icon set.",
    // lucide-static is released with lucide-react.
    tags: { package: "lucide-static", file: "tags.json" }
  },
  "@hugeicons/core-free-icons": {
    id: "hugeicons",
    name: "Hugeicons",
    description: "Thousands of free icons as data, drawn by Hugeicons' React component.",
    icons: {
      render: { import: "@hugeicons/react", component: "HugeiconsIcon", prop: "icon" },
      // Each icon is also exported as `…FreeIcons`; the `…Icon` names are the ones its docs use.
      match: "Icon$"
    }
  },
  "@heroicons/react": {
    id: "heroicons",
    name: "Heroicons",
    description: "Hand-crafted SVG icons from the makers of Tailwind CSS, outline and solid, at 24, 20 and 16px.",
    icons: { import: "@heroicons/react/24/outline", render: "export" }
  },
  "@phosphor-icons/react": {
    id: "phosphor",
    name: "Phosphor",
    description: "A flexible icon family with six weights, picked with the weight prop.",
    icons: {
      render: "export",
      variants: {
        prop: "weight",
        styles: ["thin", "light", "regular", "bold", "fill", "duotone"],
        default: { style: "regular" }
      }
    },
    // Phosphor's catalog is a compiled module, released apart from the React package, less often.
    tags: { package: "@phosphor-icons/core", file: "dist/index.mjs" }
  },
  "@tabler/icons-react": {
    id: "tabler",
    name: "Tabler Icons",
    description: "Over 5,000 outline and filled icons on a 24px grid.",
    icons: {
      render: "export",
      variants: {
        pattern: "^(?<name>Icon.+?)(?<style>Filled)?$",
        styles: ["Outline", "Filled"],
        default: { style: "Outline" }
      }
    },
    // The React package depends on @tabler/icons at its own version, which lists each icon's tags and category.
    tags: { package: "@tabler/icons", file: "icons.json" }
  },
  "@fluentui/react-icons": {
    id: "fluent-icons",
    name: "Fluent icons",
    description: "Microsoft's Fluent System Icons, in Regular and Filled styles, some with a size in the name.",
    icons: {
      render: "export",
      variants: {
        pattern: "^(?<name>.+?)(?<size>\\d+)?(?<style>Regular|Filled|Color|Light)$",
        styles: ["Regular", "Filled", "Color", "Light"],
        sizes: [10, 12, 16, 20, 24, 28, 32, 48],
        default: { style: "Regular" }
      }
    },
    // Each icon's metaphors are in its folder of the repository, at the commit npm says the version came from.
    tags: { files: "assets/*/metadata.json" }
  }
}

function breakpointName(id: string): string {
  return { xs: "Extra small", sm: "Small", md: "Medium", lg: "Large", xl: "XL" }[id] ?? id.toUpperCase()
}

function muiCategory(name: string): CollectedToken["category"] {
  if (name.startsWith("mui-palette-")) return "color"
  if (name.startsWith("mui-shadows-")) return "shadow"
  if (name === "mui-shape-borderRadius") return "radius"
  if (name === "mui-spacing") return "spacing"
  if (name.startsWith("mui-font-")) return "font"
  if (name.startsWith("mui-zIndex-")) return "other"
  return "other"
}

function chakraCategory(name: string, value: string): CollectedToken["category"] {
  const kind = /^chakra-([a-z]+(?:-[a-z]+)?)-/.exec(name)?.[1] ?? ""
  const map: Record<string, CollectedToken["category"]> = {
    colors: "color",
    spacing: "spacing",
    radii: "radius",
    "font-sizes": "font-size",
    fonts: "font",
    "font-weights": "font-weight",
    "letter-spacings": "tracking",
    "line-heights": "leading",
    shadows: "shadow",
    breakpoints: "breakpoint",
    sizes: "container",
    durations: "motion",
    easings: "motion"
  }
  return map[kind] ?? (/^(?:#|rgb|hsl|oklch|color-mix)/.test(value) ? "color" : "other")
}

function fluentCategory(name: string): CollectedToken["category"] {
  if (name.startsWith("color")) return "color"
  if (name.startsWith("spacing")) return "spacing"
  if (name.startsWith("borderRadius")) return "radius"
  if (name.startsWith("fontSize")) return "font-size"
  if (name.startsWith("lineHeight")) return "leading"
  if (name.startsWith("fontWeight")) return "font-weight"
  if (name.startsWith("fontFamily")) return "font"
  if (name.startsWith("shadow")) return "shadow"
  if (name.startsWith("duration") || name.startsWith("curve")) return "motion"
  return "other"
}
