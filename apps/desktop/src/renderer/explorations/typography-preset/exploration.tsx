import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { useId, useState } from "react"
import {
  type CodeLine,
  fontStack,
  libraryCode,
  overrideFields,
  type PresetProject,
  projectById,
  type ProjectId,
  projects,
  stored,
  tailwindCode,
  type TextLayer,
  typeAt,
  type TypeField,
  viewports,
  type ViewportId
} from "./presets.ts"
import { type Locking, PresetTextSection } from "./text-section.tsx"

const lockings: { id: Locking; title: string; note: string }[] = [
  {
    id: "folded-locked",
    title: "Folded and locked",
    note: "The rows the preset covers fold into a summary and open locked. Unlock one to override it."
  },
  {
    id: "folded",
    title: "Folded into the preset",
    note: "The rows the preset covers fold into its row as a summary. Open the summary to see them or override one."
  },
  {
    id: "disabled",
    title: "Shown locked",
    note: "The rows the preset covers stay in place, locked to its values. Unlock one to override it."
  }
]

export interface ExplorationProps {
  project?: ProjectId
  viewport?: ViewportId
  /** The layer each of the three starts with, in the project shown first. */
  start?: (project: PresetProject) => TextLayer
  /** Folded only: starts with the preset's rows shown. */
  folded?: boolean
}

const applied = (project: PresetProject): TextLayer => ({ preset: project.initial, own: {} })

/**
 * The Text section of a text layer with a typography preset applied, three ways side by side, each with the layer
 * drawn above it and what it stores and writes below. The project and the viewport are shared, as the open project and
 * the Modes panel's viewport are; each of the three keeps its own layer, so they can be tried apart.
 */
export function TypographyPresetExploration({
  project: firstProject = "fluent",
  viewport: firstViewport = "desktop",
  start = applied,
  folded = false
}: ExplorationProps) {
  const [projectId, setProjectId] = useState(firstProject)
  const [viewport, setViewport] = useState(firstViewport)
  const project = projectById(projectId)
  const startWith = projectId === firstProject ? start : applied
  return (
    // The app's body never scrolls, so the exploration scrolls itself.
    <div className="h-screen overflow-y-auto bg-background px-4 py-6 text-foreground sm:px-6">
      <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex max-w-xl min-w-0 flex-col gap-1">
          <h1 className="text-sm font-semibold">Typography presets</h1>
          <p className="text-xs text-muted-foreground">
            A typography preset fills in the type rows it covers and locks them to the design language. Pick one, change
            a row to override it, or detach it to keep its values as the layer&apos;s own.
          </p>
        </div>
        <ProjectPicker value={projectId} onChange={setProjectId} />
        <ViewportPicker value={viewport} onChange={setViewport} />
      </header>
      <div key={projectId} className="flex flex-wrap items-start gap-6">
        {lockings.map((locking) => (
          <Version
            key={locking.id}
            locking={locking}
            project={project}
            viewport={viewport}
            start={startWith(project)}
            folded={folded}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectPicker({ value, onChange }: { value: ProjectId; onChange: (value: ProjectId) => void }) {
  const id = useId()
  const items = projects.map((project) => ({ value: project.id, label: `${project.name} (${project.fixture})` }))
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-xs text-muted-foreground">
        Project
      </span>
      <Select items={items} value={value} onValueChange={(next) => next && onChange(next as ProjectId)}>
        <SelectTrigger size="sm" aria-labelledby={id} className="h-7 w-64 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ViewportPicker({ value, onChange }: { value: ViewportId; onChange: (value: ViewportId) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-xs text-muted-foreground">
        Viewport
      </span>
      <ToggleGroup
        aria-labelledby={id}
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        onValueChange={([next]) => next && onChange(next as ViewportId)}
      >
        {viewports.map((viewport) => (
          <ToggleGroupItem key={viewport.id} value={viewport.id} className="h-7 px-2 text-xs">
            {viewport.name} {viewport.width}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** One of the three: the layer drawn, its Text section, and what it stores and writes. */
function Version({
  locking,
  project,
  viewport,
  start,
  folded
}: {
  locking: (typeof lockings)[number]
  project: PresetProject
  viewport: ViewportId
  start: TextLayer
  folded: boolean
}) {
  const [layer, setLayer] = useState(start)
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex w-full max-w-80 min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-sm font-medium">
          {locking.title}
        </h2>
        <p className="min-h-8 text-xs text-muted-foreground">{locking.note}</p>
      </div>
      <TextLayerPreview project={project} layer={layer} viewport={viewport} />
      <div className="overflow-hidden rounded-lg border bg-background">
        <PresetTextSection
          locking={locking.id}
          project={project}
          layer={layer}
          viewport={viewport}
          onChange={setLayer}
          initiallyOpen={folded}
        />
      </div>
      <Output project={project} layer={layer} />
    </section>
  )
}

/** The text layer as its frame draws it, in the viewport shown. */
function TextLayerPreview({
  project,
  layer,
  viewport
}: {
  project: PresetProject
  layer: TextLayer
  viewport: ViewportId
}) {
  const type = typeAt(project, layer, viewport)
  const size = type.size ?? project.inherited.size
  const lineHeight = type.lineHeight
  const spacing = type.letterSpacing
  const color = project.colors.find((token) => token.name === layer.color)?.values.default
  return (
    <figure className="flex h-36 items-center overflow-hidden rounded-lg border bg-white px-4 text-black">
      <figcaption className="sr-only">The text layer, as its frame draws it</figcaption>
      <p
        className="w-full"
        style={{
          fontFamily: fontStack(project, type.font ?? project.inherited.font),
          fontWeight: type.weight,
          fontSize: size,
          lineHeight: lineHeight && ("px" in lineHeight ? `${lineHeight.px}px` : lineHeight.multiple),
          letterSpacing: spacing && ("px" in spacing ? `${spacing.px}px` : `${spacing.em}em`),
          textTransform: type.case === "none" ? undefined : type.case,
          color,
          textAlign: layer.align,
          fontStyle: layer.italic ? "italic" : undefined,
          textDecoration: layer.decoration
        }}
      >
        Quarterly report
      </p>
    </figure>
  )
}

/** What the layer stores, the same in every project, and the code an adapter writes from it. */
function Output({ project, layer }: { project: PresetProject; layer: TextLayer }) {
  const [adapter, setAdapter] = useState<"tailwind" | "library">("tailwind")
  const overridden = overrideFields(project, layer)
  const code = adapter === "library" && project.library ? libraryCode(project, layer) : tailwindCode(project, layer)
  return (
    <div className="flex flex-col gap-3">
      <CodeBlock size="sm">
        <CodeBlockHeader>
          <CodeBlockTitle>Stored value</CodeBlockTitle>
        </CodeBlockHeader>
        <Lines lines={storedLines(stored(layer), overridden)} />
      </CodeBlock>
      <CodeBlock size="sm">
        <CodeBlockHeader>
          <CodeBlockTitle>Code</CodeBlockTitle>
          {project.library && (
            <CodeBlockActions>
              <ToggleGroup
                aria-label="Adapter"
                variant="outline"
                size="sm"
                spacing={0}
                value={[adapter]}
                onValueChange={([next]) => next && setAdapter(next as typeof adapter)}
              >
                <ToggleGroupItem value="tailwind" className="h-6 px-2 text-[11px]">
                  Tailwind
                </ToggleGroupItem>
                <ToggleGroupItem value="library" className="h-6 px-2 text-[11px]">
                  {project.library}
                </ToggleGroupItem>
              </ToggleGroup>
            </CodeBlockActions>
          )}
        </CodeBlockHeader>
        <Lines lines={code} />
      </CodeBlock>
    </div>
  )
}

function Lines({ lines }: { lines: CodeLine[] }) {
  return (
    <CodeBlockContent wrap className="text-[11px]">
      {lines.map((line, index) => (
        <CodeBlockLine key={index} variant={line.override ? "highlighted" : "default"}>
          {line.text || " "}
        </CodeBlockLine>
      ))}
    </CodeBlockContent>
  )
}

/** The stored value as JSON, one line per value, with each override marked. */
function storedLines(value: Record<string, unknown>, overridden: ReadonlySet<TypeField>): CodeLine[] {
  const lines: CodeLine[] = []
  const walk = (key: string | undefined, entry: unknown, depth: number, last: boolean) => {
    const pad = "  ".repeat(depth)
    const name = key === undefined ? "" : `"${key}": `
    const comma = last ? "" : ","
    const isLeaf =
      typeof entry !== "object" ||
      entry === null ||
      Object.values(entry).every((part) => typeof part !== "object" || part === null)
    if (isLeaf) {
      const text = JSON.stringify(entry)
        .replaceAll(/([{,:])/g, "$1 ")
        .replaceAll(/\s*}/g, " }")
      lines.push({ text: `${pad}${name}${text}${comma}`, override: overridden.has(key as TypeField) })
      return
    }
    lines.push({ text: `${pad}${name}{` })
    const entries = Object.entries(entry)
    entries.forEach(([child, part], index) => walk(child, part, depth + 1, index === entries.length - 1))
    lines.push({ text: `${pad}}${comma}` })
  }
  walk(undefined, value, 0, true)
  return lines
}
