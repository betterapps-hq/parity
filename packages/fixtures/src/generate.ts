import { spawn } from "node:child_process"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, delimiter, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Generates the validation projects in the repo's `fixtures/` folder. Each starts from its tools' own scaffolders at
 * pinned versions, gets its own files laid over it from `overlays/<name>`, and is installed with its own package
 * manager so its lockfile is committed with it. A project's `expected.json` is kept when it's regenerated.
 *
 *   pnpm --filter @parity-app/fixtures generate [name...]   regenerates the named projects, or all of them
 *   pnpm --filter @parity-app/fixtures install-projects     installs every project from its committed lockfile
 *
 * Projects are generated and installed one at a time, to keep memory down.
 */

interface Project {
  /** Installs the project from its committed lockfile. */
  install: string
  /** Creates the project in `dir`, which doesn't exist yet. */
  generate(dir: string): Promise<void>
}

const projects: Record<string, Project> = {
  "vite7-js": {
    install: "npm ci",
    async generate(dir) {
      // create-vite 8 still scaffolds Vite 7.
      await createVite("8.3.0", dir, "react", "--no-interactive --no-rolldown")
      await remove(dir, "vite.config.js", "src/App.css", "src/assets")
      await overlay(dir, "vite7-js")
      await run(dir, "npm install")
    }
  },
  "react-aria": {
    install: "yarn install --immutable",
    async generate(dir) {
      // Vite 7, not 8: Storybook 9 accepts Vite 5 to 7 only.
      await createVite("8.3.0", dir, "react-ts", "--no-interactive --no-rolldown")
      await remove(dir, "vite.config.ts", "src/App.css", "src/assets")
      await replaceIn(dir, "tsconfig.node.json", '"vite.config.ts"', '"vite.config.mts"')
      await overlay(dir, "react-aria")
      await writeFile(
        join(dir, ".gitignore"),
        `${await readFile(join(dir, ".gitignore"), "utf8")}.yarn/install-state.gz\n`
      )
      // An empty lockfile makes Yarn treat this folder as a project of its own, not part of the repo around it.
      await writeFile(join(dir, "yarn.lock"), "")
      await editPackage(dir, (pkg) => {
        pkg.packageManager = "yarn@4.18.1"
        addDependencies(pkg, "dependencies", {
          "@hugeicons/core-free-icons": "4.3.5",
          "@hugeicons/react": "1.1.10",
          "react-aria-components": "1.22.1"
        })
        addDependencies(pkg, "devDependencies", { "@tailwindcss/vite": "4.3.3", tailwindcss: "4.3.3" })
      })
      await storybook(
        dir,
        "npx --yes create-storybook@9.1.21 --yes --no-dev --skip-install --type react --builder vite --package-manager yarn2"
      )
      await remove(dir, "src/stories")
      await prepend(dir, ".storybook/preview.ts", 'import "../src/index.css"\n')
      await run(dir, "yarn install")
    }
  },
  mantine: {
    install: "bun install --frozen-lockfile",
    async generate(dir) {
      await createVite("9.3.1", dir, "react-ts", "--no-interactive --no-immediate")
      await remove(dir, "vite.config.ts", "src/App.css", "src/assets")
      await replaceIn(dir, "tsconfig.node.json", '"vite.config.ts"', '"vite.config.cts"')
      await overlay(dir, "mantine")
      // Mantine's Vite guide: the components, then PostCSS with Mantine's preset for the project's own CSS modules.
      await editPackage(dir, (pkg) => {
        addDependencies(pkg, "dependencies", { "@mantine/core": "9.7.3", "@mantine/hooks": "9.7.3" })
        addDependencies(pkg, "devDependencies", {
          postcss: "8.5.31",
          "postcss-preset-mantine": "1.18.0",
          "postcss-simple-vars": "7.0.1"
        })
      })
      await run(dir, "bun install")
    }
  },
  "too-old": {
    install: "npm ci",
    async generate(dir) {
      // Every tool here is past the version cutoff: React 18, Vite 5, Tailwind v3 and Storybook 8.
      await createVite("5.5.5", dir, "react-ts", "")
      await editPackage(dir, (pkg) =>
        addDependencies(pkg, "devDependencies", { autoprefixer: "10.6.1", postcss: "8.5.31", tailwindcss: "3.4.19" })
      )
      await run(dir, "npx --yes tailwindcss@3.4.19 init -p")
      await storybook(
        dir,
        "npx --yes storybook@8.6.19 init --yes --skip-install --no-dev --type react --builder vite --package-manager npm"
      )
      await remove(dir, "src/App.css", "src/assets", "src/stories")
      await overlay(dir, "too-old")
      await prepend(dir, ".storybook/preview.ts", 'import "../src/index.css"\n')
      await run(dir, "npm install")
    }
  }
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const fixturesDir = resolve(packageDir, "../../fixtures")
const overlaysDir = join(packageDir, "overlays")
const shimDir = join(tmpdir(), "parity-fixtures-bin")

// Scaffolders run as if from a plain terminal: pnpm's own `npm_*` variables would tell them pnpm is in charge.
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH"
const env: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_"))),
  [pathKey]: `${shimDir}${delimiter}${process.env[pathKey] ?? ""}`,
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  STORYBOOK_DISABLE_TELEMETRY: "1"
}

/**
 * Runs Storybook's own init. With `--yes` it installs its recommended features, which outside CI include the Vitest
 * addon and a browser download that no check here uses, so it runs the way it would in CI.
 */
function storybook(dir: string, command: string): Promise<void> {
  return run(dir, `${command} --disable-telemetry`, { CI: "1" })
}

async function createVite(version: string, dir: string, template: string, flags: string): Promise<void> {
  await mkdir(dirname(dir), { recursive: true })
  await run(dirname(dir), `npx --yes create-vite@${version} ${basename(dir)} --template ${template} ${flags}`)
}

/** Lays the project's own files (components, styles, stories, config) over what the scaffolders wrote. */
async function overlay(dir: string, name: string): Promise<void> {
  await cp(join(overlaysDir, name), dir, { recursive: true, force: true })
}

async function remove(dir: string, ...paths: string[]): Promise<void> {
  for (const path of paths) await rm(join(dir, path), { recursive: true, force: true })
}

/** Edits a scaffolded file, failing when the scaffolder no longer writes what's expected. */
async function replaceIn(dir: string, path: string, from: string, to: string): Promise<void> {
  const source = await readFile(join(dir, path), "utf8")
  if (!source.includes(from)) throw new Error(`${path} no longer contains ${from}`)
  await writeFile(join(dir, path), source.replace(from, to))
}

async function prepend(dir: string, path: string, text: string): Promise<void> {
  await writeFile(join(dir, path), text + (await readFile(join(dir, path), "utf8")))
}

type PackageJson = Record<string, unknown> & { dependencies?: Record<string, string> }

async function editPackage(dir: string, edit: (pkg: PackageJson) => void): Promise<void> {
  const path = join(dir, "package.json")
  const pkg = JSON.parse(await readFile(path, "utf8")) as PackageJson
  edit(pkg)
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** Adds dependencies at exact versions, sorted the way package managers keep them. */
function addDependencies(pkg: PackageJson, field: string, added: Record<string, string>): void {
  const merged = { ...(pkg[field] as Record<string, string> | undefined), ...added }
  pkg[field] = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, "en")))
}

function run(cwd: string, command: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  console.log(`\n> ${command}   (in fixtures/${relative(fixturesDir, cwd).replaceAll("\\", "/")})`)
  return new Promise((done, fail) => {
    // Package managers are .cmd scripts on Windows, which only start through a shell. Commands come from this file.
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...env, ...extraEnv }
    })
    child.on("error", fail)
    child.on("close", (code) => (code === 0 ? done() : fail(new Error(`${command} exited with ${code}`))))
  })
}

const args = process.argv.slice(2)
const names = args.filter((arg) => !arg.startsWith("--"))
for (const name of names) {
  if (!(name in projects)) throw new Error(`No project named ${name}. Known: ${Object.keys(projects).join(", ")}`)
}
// Yarn comes through Corepack, at the version each project's `packageManager` names.
await mkdir(shimDir, { recursive: true })
await mkdir(fixturesDir, { recursive: true })
await run(fixturesDir, `corepack enable yarn --install-directory "${shimDir}"`)
for (const name of names.length > 0 ? names : Object.keys(projects)) {
  const dir = join(fixturesDir, name)
  const project = projects[name]!
  if (args.includes("--install")) {
    await run(dir, project.install)
    continue
  }
  const expected = await readFile(join(dir, "expected.json"), "utf8").catch(() => undefined)
  await rm(dir, { recursive: true, force: true })
  await project.generate(dir)
  if (expected !== undefined) await writeFile(join(dir, "expected.json"), expected)
  console.log(`\nGenerated fixtures/${name}`)
}
