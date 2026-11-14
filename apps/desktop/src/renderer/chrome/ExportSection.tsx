import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { describeFiles, type ExportSize, exportFiles, nextExportSize } from "@parity-app/editor"
import { Download, Minus, Plus } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { setEffectivePreference, useEffectivePreferences } from "../project-settings.ts"
import { AppSelect } from "./AppSelect.tsx"
import { type ExportTarget, exportLayers } from "./commands.ts"
import { IconButton } from "./IconButton.tsx"
import { PanelSection } from "./PanelSection.tsx"

/**
 * The Export section (PAR-185), at the foot of the Design tab for a design, a layer or several: the sizes to write,
 * PNGs or JPGs at 1x to 3x, the files that makes, named after the layers, and Export, which asks for a folder. The
 * sizes are remembered for every export, from here, the menus and Ctrl+Shift+E.
 */
export function ExportSection({ targets, label }: { targets: ExportTarget[]; label: string }) {
  const session = useProject()
  const { exportSizes: sizes } = useEffectivePreferences(session.store)

  const files = exportFiles(
    targets.map((target) => target.name),
    sizes
  )

  const next = nextExportSize(sizes)

  const setSizes = (exportSizes: ExportSize[]) =>
    setEffectivePreference({ key: "exportSizes", value: exportSizes }, session.store)

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
            <AppSelect<ExportSize["scale"]>
              variant="panel"
              aria-label="Scale"
              className="w-20"
              items={[
                { value: 1, label: "1x" },
                { value: 2, label: "2x" },
                { value: 3, label: "3x" }
              ]}
              value={size.scale}
              onValueChange={(scale) => scale && change(index, { scale })}
            />
            <AppSelect<ExportSize["format"]>
              variant="panel"
              aria-label="Format"
              className="min-w-0 flex-1"
              items={[
                { value: "png", label: "PNG" },
                { value: "jpg", label: "JPG" }
              ]}
              value={size.format}
              onValueChange={(format) => format && change(index, { format })}
            />
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
