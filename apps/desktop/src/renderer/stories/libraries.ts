import type { AdapterIcon } from "@parity-app/core"
import { shadcnSettings } from "@parity-app/extension-shadcn/shadcn"
import catalog from "@parity-app/registry/catalog.json"
import type { CatalogLibrary, LibraryLook } from "../../shared/protocol.ts"
import type { ShownPreview } from "../chrome/AddLibraryDialog.tsx"
import { type PreviewToken, tokenSections } from "../chrome/token-previews.tsx"
import previews from "./library-previews.json"

/*
 * The component libraries the stand-in service offers, as Parity's would: the registry's catalog, with each library's
 * name and version from its registry file, and what its file holds, read from the registry's files by
 * `library-previews.json`. Chakra UI's animations run its own keyframes, from its theme, which the files don't hold yet.
 */

/** The registry's catalog, each entry as the service reads it. */
const offered: {
  id: string
  logo?: AdapterIcon
  links: NonNullable<CatalogLibrary["links"]>
  look: LibraryLook
  companion?: string
}[] = catalog.libraries

/** What each library's registry file, or its extension, says about it. */
const described = new Map<string, Omit<CatalogLibrary, "id" | "kind" | "installed">>([
  [
    "shadcn",
    {
      name: "Shadcn",
      description: "shadcn/ui's components, generated in the app by shadcn-sync.",
      package: "@buildkitgg/shadcn",
      settings: shadcnSettings({ base: "base", style: "nova", theme: "neutral", icons: "lucide" })
    }
  ],
  [
    "mantine",
    {
      name: "Mantine",
      description: "A full-featured component library with CSS modules and its own hooks.",
      package: "@mantine/core",
      version: "9.7.3"
    }
  ],
  [
    "chakra",
    {
      name: "Chakra UI",
      description: "Accessible components with style props, on Emotion.",
      package: "@chakra-ui/react",
      version: "3.37.0"
    }
  ],
  [
    "fluent",
    {
      name: "Fluent UI",
      description: "Microsoft's Fluent 2 design system for React, styled with Griffel.",
      package: "@fluentui/react-components",
      version: "9.75.0"
    }
  ],
  [
    "mui",
    {
      name: "Material UI",
      description: "Google's Material Design in React, styled with Emotion.",
      package: "@mui/material",
      version: "9.5.0"
    }
  ]
])

/** The icon sets the registry has files for, Lucide added already. */
const iconSets: CatalogLibrary[] = [
  ["lucide", "Lucide", "Over 1,600 consistent, open source icons; shadcn's default icon set.", "lucide-react", true],
  ["tabler", "Tabler Icons", "Over 5,000 outline and filled icons on a 24px grid.", "@tabler/icons-react", false],
  [
    "phosphor",
    "Phosphor",
    "A flexible icon family with six weights, picked with the weight prop.",
    "@phosphor-icons/react",
    false
  ],
  [
    "hugeicons",
    "Hugeicons",
    "Thousands of free icons as data, drawn by Hugeicons' React component.",
    "@hugeicons/core-free-icons",
    false
  ],
  [
    "fluent-icons",
    "Fluent icons",
    "Microsoft's Fluent System Icons, in Regular and Filled styles, some with a size in the name.",
    "@fluentui/react-icons",
    false
  ]
].map(([id, name, description, packageName, installed]) => ({
  id: String(id),
  name: String(name),
  description: String(description),
  package: String(packageName),
  kind: "icons",
  installed: installed === true
}))

/** The stand-in catalog, with the libraries `added` names marked as the project's and Shadcn's settings `shadcn`. */
export function storyCatalog({
  added = [],
  shadcn
}: { added?: string[]; shadcn?: Parameters<typeof shadcnSettings>[0] } = {}): CatalogLibrary[] {
  const components = offered.flatMap((entry): CatalogLibrary[] => {
    const library = described.get(entry.id)

    if (!library) {
      return []
    }

    return [
      {
        ...library,
        settings: entry.id === "shadcn" && shadcn ? shadcnSettings(shadcn) : library.settings,
        id: entry.id,
        kind: "components",
        installed: added.includes(entry.id),
        links: entry.links,
        logo: entry.logo,
        look: entry.look,
        companion: entry.companion
      }
    ]
  })

  return [...components, ...iconSets]
}

/** The kinds of token the previews draw. */
const drawnKinds = tokenSections.flatMap((section) => section.kinds.map(({ kind }) => kind))

type Read = (typeof previews)[keyof typeof previews]

const files = new Map<string, Read>(Object.entries(previews))

/** What a library's registry file holds, as the service reads it; shadcn's for the style chosen. */
export function storyPreview(library: string, settings?: Record<string, string>): ShownPreview | undefined {
  const read = files.get(library === "shadcn" ? `shadcn:${settings?.style ?? "nova"}` : library)

  if (!read) {
    return undefined
  }

  return {
    components: read.components,
    families: read.families,
    breakpoints: read.breakpoints,
    themes: read.themes,
    tokens: read.tokens.flatMap((token): PreviewToken[] => {
      const kind = drawnKinds.find((drawn) => drawn === token.kind)

      const values = Object.fromEntries(
        Object.entries(token.values).filter((entry): entry is [string, string] => entry[1] !== undefined)
      )

      return kind ? [{ name: token.name, kind, values }] : []
    }),
    keyframes: "keyframes" in read ? read.keyframes : undefined
  }
}
