import { Button, Select, SelectItem, SelectTrigger, SelectValue } from "@buildkitgg/shadcn-baseui-kit"
import { describeFiles, type ExportSize, exportFiles, nextExportSize } from "@parity-app/editor"
import { Download, Minus, Plus } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { type ExportTarget, exportLayers } from "./commands.ts"
import { PanelSelectContent } from "./fields.tsx"
import { IconButton } from "./IconButton.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { setPreferences, usePreferences } from "./preferences.ts"

/**
 * The Export section (PAR-185), at the foot of the Design tab for a design, a layer or several: the sizes to write,
 * PNGs or JPGs at 1x to 3x, the files that makes, named after the layers, and Export, which asks for a folder. The
 * sizes are remembered for every export, from here, the menus and Ctrl+Shift+E.
 */
export function ExportSection({ targets, label }: { targets: ExportTarget[]; label: string }) {
  const session = useProject()
  const { exportSizes: sizes } = usePreferences()

  const files = exportFiles(
    targets.map((target) => target.name),
    sizes
  )

  const next = nextExportSize(sizes)
  const setSizes = (exportSizes: ExportSize[]) => setPreferences({ exportSizes })

  const change = (index: number, size: Partial<ExportSize>) =>
    setSizes(sizes.map((current, at) => (at === index ? { ...current, ...size } : current)))

  return (
    <PanelSection
      title="Export"
      action={
        <IconButton label="Add a size" disabled={!next} onClick={() => next && setSizes([...sizes, next])}>
          <Plus />
        </IconButton>
      }
    >
      <ul aria-label="Sizes" className="flex flex-col gap-1.5">
        {sizes.map((size, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <Select<ExportSize["scale"]>
              value={size.scale}
              onValueChange={(scale) => scale && change(index, { scale })}
            >
              <SelectTrigger size="sm" className="h-7 w-20 text-xs" aria-label="Scale">
                <SelectValue>{(value: ExportSize["scale"]) => `${value}x`}</SelectValue>
              </SelectTrigger>
              <PanelSelectContent>
                <SelectItem value={1}>1x</SelectItem>
                <SelectItem value={2}>2x</SelectItem>
                <SelectItem value={3}>3x</SelectItem>
              </PanelSelectContent>
            </Select>
            <Select<ExportSize["format"]>
              value={size.format}
              onValueChange={(format) => format && change(index, { format })}
            >
              <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-xs" aria-label="Format">
                <SelectValue>{(value: ExportSize["format"]) => value.toUpperCase()}</SelectValue>
              </SelectTrigger>
              <PanelSelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpg">JPG</SelectItem>
              </PanelSelectContent>
            </Select>
            <IconButton
              label="Remove this size"
              disabled={sizes.length === 1}
              onClick={() => setSizes(sizes.filter((_, at) => at !== index))}
            >
              <Minus />
            </IconButton>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 px-1 font-mono text-2xs/4 break-all text-muted-foreground">{describeFiles(files)}</p>
      {sizes.some((size) => size.format === "jpg") && (
        <p className="type-description mt-1.5 px-1 text-muted-foreground">
          A JPG has no see-through parts, so they&apos;re white.
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={() => void exportLayers(session.id, targets, sizes)}
      >
        <Download /> {label}
      </Button>
    </PanelSection>
  )
}
