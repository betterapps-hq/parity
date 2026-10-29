/**
 * What Parity found in a project and where, so people and agents can see why it reads the project as it does. Each
 * detection says, for example, "Vite 8.3.5 from `node_modules/vite`, config `vite.config.cts`", or, when nothing was
 * found, what was looked for.
 */
export interface Detection {
  /** The tool's id, matching its adapter's where there is one: `vite`, `react`, `tailwind`, `storybook`, `pnpm`. */
  id: string
  /** Its name for people, such as `Vite`. */
  name: string
  /** The version installed, or for a package manager, the one the project asks for. */
  version?: string
  /** Where it was found, relative to the project root: an installed package's folder, a lockfile or package.json. */
  from?: string
  /** The config file it uses, relative to the project root. */
  config?: string
  /** The range package.json asks for, when the package isn't installed. */
  declared?: string
  /**
   * Whether Parity tests the version, by the version cutoff: `dropped` is older than it tests, though nothing blocks
   * it; `newer` is a major Parity hasn't seen yet; `missing` is a package that's declared but not installed.
   */
  status?: "supported" | "newer" | "dropped" | "missing"
  /** When a tested version stops being tested, as `YYYY-MM-DD`: two years after it came out. Unset for the newest. */
  drops?: string
  /** What was found and where, or what was looked for, in a sentence. */
  summary: string
}

/** The package manager a project uses, with the agent name its command table knows it by (`yarn@berry`, `pnpm`). */
export interface PackageManagerDetection extends Detection {
  agent: string
}

/** Everything detection found in a project. */
export interface ProjectDetection {
  packageManager: PackageManagerDetection
  /** The tools Parity runs or renders with: the build tool, the UI framework, styling and Storybook. */
  tools: Detection[]
  /**
   * A quiet note naming versions the cutoff drops, which Parity doesn't test but doesn't block either. Unset when
   * nothing is dropped.
   */
  notice?: string
}
