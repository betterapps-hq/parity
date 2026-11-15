import { spawn } from "node:child_process"
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, delimiter, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { jsonText, type PackageManifest, parseData, parseManifest, plainObject } from "@parity-app/core"

/**
 * Generates the validation projects in the repo's `fixtures/` folder. Each starts from its tools' own scaffolders at
 * pinned versions, gets its own files laid over it from `overlays/<name>`, and is installed with its own package
 * manager so its lockfile is committed with it. A project's `expected.json` is kept when it's regenerated.
 *
 *   pnpm --filter @parity-app/fixtures generate [name...]   regenerates the named projects, or all of them
 *   pnpm --filter @parity-app/fixtures install-projects [name...]   installs the named projects in fixtures/, or all
 *                                                                   of them, from their committed lockfiles
 *
 * Projects are generated and installed one at a time, to keep memory down.
 */

interface Project {
  /** Installs the project from its committed lockfile. */
  install: string
  /** Creates the project in `dir`, which doesn't exist yet. */
  generate(dir: string): Promise<void>
}

const projects = new Map<string, Project>([
  [
    "vite7-js",
    {
      install: "npm ci",
      async generate(dir) {
        // create-vite 8 still scaffolds Vite 7.
        await createVite("8.3.0", dir, "react", "--no-interactive --no-rolldown")
        await remove(dir, "vite.config.js", "src/App.css", "src/assets")
        await overlay(dir, "vite7-js")
        await run(dir, "npm install")
      }
    }
  ],
  [
    "react-aria",
    {
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
    }
  ],
  [
    "mantine",
    {
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
    }
  ],
  [
    "react18-mui-js",
    {
      install: "yarn install --immutable",
      async generate(dir) {
        // create-vite 6 scaffolds Vite 6, the oldest Vite with time left; React goes back to 18 from the template's 19.
        await createVite("6.5.0", dir, "react", "")
        await remove(dir, "src/App.jsx", "src/App.css", "src/assets")
        await overlay(dir, "react18-mui-js")
        await writeFile(
          join(dir, ".gitignore"),
          `${await readFile(join(dir, ".gitignore"), "utf8")}.yarn/install-state.gz\n`
        )
        // An empty lockfile makes Yarn treat this folder as a project of its own, not part of the repo around it.
        await writeFile(join(dir, "yarn.lock"), "")
        await editPackage(dir, (pkg) => {
          pkg.packageManager = "yarn@4.18.1"
          // MUI on Emotion with MUI's icons, and React Router in library mode (React Router 8 needs React 19).
          addDependencies(pkg, "dependencies", {
            "@emotion/react": "11.14.0",
            "@emotion/styled": "11.14.1",
            "@mui/icons-material": "9.5.0",
            "@mui/material": "9.5.0",
            react: "18.3.1",
            "react-dom": "18.3.1",
            "react-router": "7.18.5"
          })
          addDependencies(pkg, "devDependencies", { "@types/react": "18.3.31", "@types/react-dom": "18.3.7" })
        })
        await run(dir, "yarn install")
      }
    }
  ],
  [
    "nextjs-webpack",
    {
      install: "npm ci",
      async generate(dir) {
        // Next.js 15, whose `next dev` runs on webpack unless it's asked for Turbopack, with React 18, which it still
        // accepts. Both routers in one project: `app/` for the dashboard, `pages/` for settings.
        await mkdir(dirname(dir), { recursive: true })
        await run(
          dirname(dir),
          `npx --yes create-next-app@15.5.29 ${basename(dir)} --ts --app --src-dir --empty --no-tailwind --no-eslint --no-turbopack --import-alias "@/*" --use-npm --skip-install --disable-git --yes`
        )
        await remove(dir, "src/app")
        await overlay(dir, "nextjs-webpack")
        // Mantine 8, the last to support React 18, set up as its Next.js guide says. The CSS modules are Sass, with the
        // breakpoints as Sass variables, so PostCSS needs only Mantine's preset.
        await editPackage(dir, (pkg) => {
          addDependencies(pkg, "dependencies", {
            "@mantine/core": "8.3.18",
            "@mantine/hooks": "8.3.18",
            "@tabler/icons-react": "3.52.0",
            react: "18.3.1",
            "react-dom": "18.3.1"
          })
          addDependencies(pkg, "devDependencies", {
            "@types/react": "18.3.31",
            "@types/react-dom": "18.3.7",
            "postcss-preset-mantine": "1.18.0",
            sass: "1.108.2"
          })
        })
        await run(dir, "npm install")
      }
    }
  ],
  [
    "nextjs-turbopack",
    {
      install: "pnpm install --frozen-lockfile",
      async generate(dir) {
        // Next.js 16, whose `next dev` runs on Turbopack, with the App Router, Tailwind v4, Headless UI, Heroicons and
        // a Recharts chart. Its routes have a group, nested layouts, `[id]` and `[...slug]` segments, `loading` and
        // `not-found` files, for the Next.js routes extension. Its own pnpm-workspace.yaml keeps it out of the repo's.
        await mkdir(dirname(dir), { recursive: true })
        await run(
          dirname(dir),
          `npx --yes create-next-app@16.4.6 ${basename(dir)} --ts --app --src-dir --empty --tailwind --no-eslint --no-biome --no-react-compiler --no-agents-md --no-agent-feedback --import-alias "@/*" --use-pnpm --skip-install --disable-git --yes`
        )
        await remove(dir, "src/app")
        await overlay(dir, "nextjs-turbopack")
        await editPackage(dir, (pkg) =>
          addDependencies(pkg, "dependencies", {
            "@headlessui/react": "2.2.10",
            "@heroicons/react": "2.2.0",
            recharts: "3.10.1"
          })
        )
        await storybook(
          dir,
          "npx --yes create-storybook@10.6.7 --yes --no-dev --skip-install --type nextjs --builder vite --package-manager pnpm --features docs"
        )
        await remove(dir, "src/stories")
        // Storybook writes the static folder with the platform's separator; the committed project uses `/`.
        const main = join(dir, ".storybook/main.ts")
        await writeFile(main, (await readFile(main, "utf8")).replaceAll(String.raw`"..\\public"`, '"../public"'))
        await prepend(dir, ".storybook/preview.tsx", 'import "../src/app/globals.css"\n')
        await run(dir, "pnpm install")
      }
    }
  ],
  [
    "webpack-react-router",
    {
      install: "pnpm install --frozen-lockfile",
      async generate(dir) {
        // Plain webpack 5 has no scaffolder, so the whole project, package.json included, comes from its overlay.
        // Its own pnpm-workspace.yaml makes pnpm treat it as a project of its own, not part of the repo around it.
        await mkdir(dir, { recursive: true })
        await overlay(dir, "webpack-react-router")
        await run(dir, "pnpm install")
      }
    }
  ],
  [
    "react-router-framework",
    {
      install: "npm ci",
      async generate(dir) {
        // React Router's own template: framework mode on its Vite plugin, with Tailwind, which this project swaps for CSS
        // modules and plain custom properties.
        await mkdir(dirname(dir), { recursive: true })
        await run(dirname(dir), `npx --yes create-react-router@8.5.1 ${basename(dir)} --yes --no-git-init --no-install`)
        await remove(
          dir,
          ".agents",
          ".dockerignore",
          "Dockerfile",
          "app/app.css",
          "app/welcome",
          "app/routes/home.tsx",
          "vite.config.ts"
        )
        await overlay(dir, "react-router-framework")
        await editPackage(dir, (pkg) => {
          const { "@tailwindcss/vite": _vite, tailwindcss: _tailwind, ...devDependencies } = pkg.devDependencies ?? {}
          pkg.devDependencies = devDependencies
          addDependencies(pkg, "dependencies", { "@phosphor-icons/react": "2.1.10", "radix-ui": "1.8.1" })
          addDependencies(pkg, "devDependencies", { "@react-router/fs-routes": "8.5.1" })
        })
        await run(dir, "npm install")
      }
    }
  ],
  [
    "too-old",
    {
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
  ]
])

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
  for (const path of paths) {
    await rm(join(dir, path), { recursive: true, force: true })
  }
}

/** Edits a scaffolded file, failing when the scaffolder no longer writes what's expected. */
async function replaceIn(dir: string, path: string, from: string, to: string): Promise<void> {
  const source = await readFile(join(dir, path), "utf8")

  if (!source.includes(from)) {
    throw new Error(`${path} no longer contains ${from}`)
  }

  await writeFile(join(dir, path), source.replace(from, to))
}

async function prepend(dir: string, path: string, text: string): Promise<void> {
  await writeFile(join(dir, path), text + (await readFile(join(dir, path), "utf8")))
}

async function editPackage(dir: string, edit: (pkg: PackageManifest) => void): Promise<void> {
  const path = join(dir, "package.json")
  const text = await readFile(path, "utf8")
  // Spread over the file's own object, so its keys stay in their order and a regenerated project diffs only where it changed.
  const pkg: PackageManifest = { ...parseData(jsonText(plainObject), text), ...parseManifest(text, path) }
  edit(pkg)
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** Adds dependencies at exact versions, sorted the way package managers keep them. */
function addDependencies(
  pkg: PackageManifest,
  field: "dependencies" | "devDependencies",
  added: Record<string, string>
): void {
  const merged = { ...pkg[field], ...added }
  pkg[field] = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, "en")))
}

function run(cwd: string, command: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  say(`\n> ${command}   (in fixtures/${relative(fixturesDir, cwd).replaceAll("\\", "/")})`)

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

/**
 * How a project in `fixtures/` installs. The ones this file generates say so themselves. The rest were made another way
 * and committed with an npm lockfile, so they install with `npm ci`.
 */
async function installCommand(name: string): Promise<string> {
  const project = projects.get(name)

  if (project) {
    return project.install
  }

  if (await exists(join(fixturesDir, name, "package-lock.json"))) {
    return "npm ci"
  }

  throw new Error(`fixtures/${name} has no package-lock.json, so install-projects can't tell how to install it`)
}

/** Prints a line of progress, between the output of the commands it runs. */
function say(line: string): void {
  process.stdout.write(`${line}
`)
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

const args = process.argv.slice(2)
const install = args.includes("--install")
const names = args.filter((arg) => !arg.startsWith("--"))

// Installing covers every project in fixtures/, since the detection tests open them all. Generating covers only the
// ones this file makes.
const known = install
  ? (await readdir(fixturesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [...projects.keys()]

for (const name of names) {
  if (!known.includes(name)) {
    throw new Error(`No project named ${name}. Known: ${known.join(", ")}`)
  }
}

// Yarn comes through Corepack, at the version each project's `packageManager` names.
await mkdir(shimDir, { recursive: true })

await mkdir(fixturesDir, { recursive: true })

await run(fixturesDir, `corepack enable yarn --install-directory "${shimDir}"`)

for (const name of names.length > 0 ? names : known) {
  const dir = join(fixturesDir, name)

  if (install) {
    await run(dir, await installCommand(name))
    continue
  }

  const project = projects.get(name)!
  const expected = await readFile(join(dir, "expected.json"), "utf8").catch(() => undefined)
  await rm(dir, { recursive: true, force: true })
  await project.generate(dir)

  if (expected !== undefined) {
    await writeFile(join(dir, "expected.json"), expected)
  }

  say(`\nGenerated fixtures/${name}`)
}
