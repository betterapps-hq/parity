import { Gauge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ProcessUsage } from "../../shared/protocol.ts"
import { usePerformanceStats } from "./performance.ts"
import { setPreferences } from "./preferences.ts"

const roleOrder: ProcessUsage["role"][] = ["this-window", "offscreen", "service", "app", "gpu", "window", "helper"]

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024).toLocaleString()} MB`
}

function percent(value: number): string {
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`
}

/** Below 50 frames a second is worth a look, below 30 the app feels slow. */
function fpsTone(fps: number): string {
  return fps < 30 ? "text-destructive" : fps < 50 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
}

/**
 * Frame rate, memory and CPU in the status bar, turned on from View > Performance stats. Clicking it shows the last
 * minute's frame rate and each process.
 */
export function PerformanceStats() {
  const { latest, history } = usePerformanceStats()
  const processes = [...(latest?.processes ?? [])].sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || b.memory - a.memory
  )
  const memory = processes.reduce((sum, process) => sum + process.memory, 0)
  const cpu = processes.reduce((sum, process) => sum + process.cpu, 0)
  const lowest = history.length > 0 ? Math.min(...history) : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 shrink-0 items-center gap-2.5 rounded px-1.5 tabular-nums hover:bg-accent hover:text-foreground"
          title="Show each process"
        >
          <Gauge className="size-3.5" />
          {latest ? (
            <>
              <span>
                <strong className={`font-medium ${fpsTone(latest.fps)}`}>{latest.fps}</strong> fps
              </span>
              <span>
                <strong className="font-medium text-foreground">{megabytes(memory)}</strong>
              </span>
              <span>
                <strong className="font-medium text-foreground">{percent(cpu)}</strong> CPU
              </span>
            </>
          ) : (
            <span>Measuring</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80 gap-0 p-0 text-xs">
        <div className="flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-3">
          <span className="text-sm font-medium">Performance</span>
          <Button size="sm" variant="ghost" onClick={() => setPreferences({ performanceStats: false })}>
            Hide stats
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-b px-3 py-2.5">
          <div className="flex items-baseline gap-1.5 tabular-nums">
            <span className={`text-lg font-semibold ${fpsTone(latest?.fps ?? 60)}`}>{latest?.fps ?? "–"}</span>
            <span className="text-muted-foreground">frames a second</span>
            {lowest !== undefined && (
              <span className="ml-auto text-muted-foreground">lowest {lowest} in the last minute</span>
            )}
          </div>
          <FrameRateChart history={history} />
          {latest && (
            <span className="text-muted-foreground tabular-nums">
              Longest frame in the last second: {latest.longestFrame} ms
            </span>
          )}
        </div>
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1.5 pl-3 text-left font-normal">Process</th>
              <th className="px-2 py-1.5 text-right font-normal">CPU</th>
              <th className="py-1.5 pr-3 text-right font-normal">Memory</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((process) => (
              <tr
                key={process.pid}
                className={process.role === "helper" ? "text-muted-foreground" : undefined}
                title={`Process ${process.pid}`}
              >
                <td className="max-w-40 truncate py-0.5 pl-3">{process.name}</td>
                <td className="px-2 py-0.5 text-right">{percent(process.cpu)}</td>
                <td className="py-0.5 pr-3 text-right">{megabytes(process.memory)}</td>
              </tr>
            ))}
            <tr className="border-t font-medium">
              <td className="py-1.5 pl-3">All of Parity</td>
              <td className="px-2 py-1.5 text-right">{percent(cpu)}</td>
              <td className="py-1.5 pr-3 text-right">{megabytes(memory)}</td>
            </tr>
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-muted-foreground">
          {latest?.heap &&
            `This window's JavaScript uses ${megabytes(latest.heap.used)} of ${megabytes(latest.heap.limit)}. `}
          CPU is a share of all {navigator.hardwareConcurrency} cores. Storybook and other programs the project service
          starts aren&apos;t counted.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** The last minute's frame rate, newest on the right, with a line at 60. */
function FrameRateChart({ history }: { history: number[] }) {
  const width = 280
  const height = 40
  const top = Math.max(60, ...history)
  const x = (index: number) => width - (history.length - 1 - index) * (width / 59)
  const y = (fps: number) => height - (fps / top) * (height - 2) - 1
  const points = history.map((fps, index) => `${x(index).toFixed(1)},${y(fps).toFixed(1)}`).join(" ")
  const last = history.at(-1)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full overflow-visible" aria-hidden>
      <line x1={0} x2={width} y1={y(60)} y2={y(60)} className="stroke-border" strokeDasharray="3 3" />
      {history.length > 1 && (
        <>
          <polygon
            points={`${x(0).toFixed(1)},${height} ${points} ${width},${height}`}
            className="fill-foreground/10"
          />
          <polyline points={points} fill="none" className="stroke-foreground/70" strokeWidth={1.5} />
        </>
      )}
      {last !== undefined && <circle cx={width} cy={y(last)} r={2.5} className="fill-foreground" />}
    </svg>
  )
}
