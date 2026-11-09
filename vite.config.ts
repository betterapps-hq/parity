import { availableParallelism } from "node:os"
import base from "@buildkitgg/oxlint-config/base"
import { defineConfig } from "vite-plus"

/*
 * What each package may import (PKG-1, docs/proposals/packages.md: The rule). A package is pure unless it's named below:
 * it takes data and returns data, with nothing from Node, React, tldraw or Electron, so a new package starts pure.
 */

/** Packages that read a project's files but never write them or start processes; writes go through project edits. */
const readers = ["code", "project", "registry"]

/** Packages at the edge, where Node and React belong: the CLI, generators, the agent runtime, adapters and fixtures. */
const edge = ["agent", "builder-vite", "cli", "fixtures", "libgen", "renderer-react", "styles-tailwind"]

const packageFiles = (names: string[]) => names.map((name) => `packages/${name}/**`)
const packageImports = (names: string[]) => names.flatMap((name) => [`@parity-app/${name}`, `@parity-app/${name}/**`])

/** What no package imports. */
const appOnly = {
  group: ["electron", "tldraw", "@tldraw/*", "@parity-app/desktop", "@parity-app/desktop/**", "**/apps/**"],
  message: "Electron, tldraw and the app belong to apps/desktop; packages never import them."
}

const noUi = {
  group: ["react", "react/**", "react-dom", "react-dom/**"],
  message: "Only renderer-react and the app use React; logic packages take data and return data."
}

/** Writing to the file system, from node:fs and node:fs/promises. */
const fileWrites = [
  "appendFile",
  "chmod",
  "chown",
  "copyFile",
  "cp",
  "link",
  "mkdir",
  "mkdtemp",
  "rename",
  "rm",
  "rmdir",
  "symlink",
  "truncate",
  "unlink",
  "utimes",
  "writeFile"
]

const readOnly =
  "Reader packages read files but never write them: return a project edit and let the project service apply it."

/**
 * What invalidates a task's cache: every file it reads, but not the listings of `node_modules` and `node_modules/.vite`.
 * On Windows Vite Task records those listings, and Vite and Vitest add folders to them as they run (`.vite-temp`,
 * `.vitest-cache`, `.vite/vitest`), so without this every task misses on a fresh checkout and `check` misses after
 * `test`. The files a task reads inside `node_modules` still count, so an install that changes them reruns it.
 */
const trackedInputs = [{ auto: true }, "!node_modules", "!node_modules/.vite/**"]

/**
 * Code that doesn't meet Buildkit's lint rules yet, with the rules each part still breaks. Each entry is a PAR-730
 * sub-issue that cleans that part up and removes its entry; delete this list, and the override it makes, when it's
 * empty. Never add to it: new code and code outside it get every rule.
 */
const notYetClean: { issue: string; files: string[]; rules: string[] }[] = [
  {
    issue: "PAR-733",
    files: ["packages/libgen/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-bitwise",
      "oxc/no-accumulating-spread"
    ]
  },
  {
    issue: "PAR-735",
    files: ["packages/agent/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "oxc/no-accumulating-spread"
    ]
  },
  {
    issue: "PAR-736",
    files: ["packages/cli/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-bitwise",
      "no-console"
    ]
  },
  {
    issue: "PAR-737",
    files: ["packages/renderer-react/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-object-parameters",
      "anti-slop/no-reflect-get",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion"
    ]
  },
  {
    issue: "PAR-738",
    files: ["packages/code/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-bitwise"
    ]
  },
  {
    issue: "PAR-739",
    files: ["packages/telemetry/**"],
    rules: [
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-object-parameters",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion"
    ]
  },
  {
    issue: "PAR-740",
    files: ["packages/project/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-object-parameters",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion"
    ]
  },
  {
    issue: "PAR-741",
    files: ["packages/tokens/**"],
    rules: [
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-console"
    ]
  },
  {
    issue: "PAR-742",
    files: ["packages/channel/**"],
    rules: [
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion"
    ]
  },
  {
    issue: "PAR-743",
    files: ["packages/builder-vite/**"],
    rules: [
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion"
    ]
  },
  {
    issue: "PAR-744",
    files: [
      "packages/registry/**",
      "packages/fixtures/**",
      "packages/models/**",
      "packages/icons/**",
      "packages/account/**",
      "packages/styles-tailwind/**"
    ],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-console"
    ]
  },
  {
    issue: "PAR-745",
    files: ["apps/desktop/src/renderer/canvas/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-object-parameters",
      "anti-slop/no-reflect-get",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-bitwise"
    ]
  },
  {
    issue: "PAR-747",
    files: ["apps/desktop/src/renderer/explorations/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "oxc/no-accumulating-spread"
    ]
  },
  {
    issue: "PAR-748",
    files: [
      "apps/desktop/src/renderer/*.ts",
      "apps/desktop/src/renderer/*.tsx",
      "apps/desktop/src/renderer/agent/**",
      "apps/desktop/src/renderer/stories/**",
      "apps/desktop/src/renderer/start/**",
      "apps/desktop/src/renderer/account/**"
    ],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-object-parameters",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-bitwise"
    ]
  },
  {
    issue: "PAR-749",
    files: ["apps/desktop/src/utility/**"],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-console"
    ]
  },
  {
    issue: "PAR-750",
    files: ["apps/desktop/src/main/**", "apps/desktop/src/preload/**", "apps/desktop/src/shared/**"],
    rules: [
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-console"
    ]
  },
  {
    issue: "PAR-751",
    files: [
      "apps/desktop/scripts/**",
      "apps/desktop/e2e/**",
      "apps/desktop/.storybook/**",
      "apps/desktop/vite.config.ts",
      "scripts/**",
      "vite.config.ts",
      "beachball.config.cjs"
    ],
    rules: [
      "anti-slop/no-array-filter-map",
      "anti-slop/no-chained-type-assertions",
      "anti-slop/no-conditional-empty-object-spread",
      "anti-slop/no-known-value-widening",
      "anti-slop/no-runtime-typeof",
      "anti-slop/no-shape-in-symbol-names",
      "anti-slop/no-unknown-parameters",
      "anti-slop/no-unknown-returns",
      "anti-slop/no-unsafe-dictionary-type",
      "anti-slop/require-safety-comment-for-type-assertion",
      "no-bitwise",
      "no-console"
    ]
  }
]

/**
 * The workspace's format, lint, type-check, test and task settings, which `vp check`, `vp test` and `vp run` read from
 * the root. Each app keeps its own Vite settings in its folder.
 */
export default defineConfig({
  fmt: {
    printWidth: 120,
    semi: false,
    trailingComma: "none",
    proseWrap: "always",
    sortImports: {
      enabled: true,
      newlinesBetween: false,
      sortSpecifiers: true
    },
    sortPackageJson: false,
    ignorePatterns: [
      // Generated from Playbook or installed by the skills CLI.
      "best-practices/**",
      ".agents/skills/**",
      ".claude/skills/**",
      "AGENTS.md",
      "CLAUDE.md",
      ".github/copilot-instructions.md",
      "**/dist/**",
      "**/out/**",
      "**/coverage/**",
      "**/node_modules/**",
      "pnpm-lock.yaml",
      "examples/**",
      "fixtures/**",
      "packages/fixtures/overlays/**"
    ]
  },
  lint: {
    // Buildkit's base rules, with every anti-slop rule, `curly`, `no-console` and `no-bitwise` (PAR-730). A rule is
    // turned off on one line, with a comment saying why, only where there's a very good reason. Types are checked on
    // push and in CI, not on commit or in `pnpm verify`: `pnpm check:types` runs this lint with `--type-aware
    // --type-check`, which adds the type-aware rules and what `tsc -p tsconfig.json` did, on TypeScript 7.
    extends: [base],
    // A list of JS plugins replaces the one base registers, so it's kept.
    jsPlugins: [...(base.jsPlugins ?? []), { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    ignorePatterns: [
      ".agents/skills/**",
      ".claude/skills/**",
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "**/coverage/**",
      "examples/**",
      "fixtures/**",
      "packages/fixtures/overlays/**",
      "*.md"
    ],
    rules: {
      // Parity's rules beyond base.
      "typescript/consistent-type-imports": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
      "react/exhaustive-deps": "error",
      // An error notification goes through `reportError`, which records it as well as showing it (PAR-632, PAR-644).
      "eslint/no-restricted-properties": [
        "error",
        {
          object: "toast",
          property: "error",
          message: "Use reportError from renderer/report-error.ts, which records the error as well as showing it."
        }
      ]
    },
    overrides: [
      {
        // Node runs these with its type stripping, which rejects parameter properties and namespaces.
        files: ["packages/**", "apps/*/scripts/**", "scripts/**"],
        rules: {
          "typescript/parameter-properties": "error",
          "typescript/no-namespace": "error"
        }
      },
      {
        // Every package is pure unless a later entry names it. `node:` on every builtin keeps the patterns whole.
        files: ["packages/**"],
        rules: {
          "unicorn/prefer-node-protocol": "error",
          "eslint/no-restricted-imports": [
            "error",
            {
              patterns: [
                appOnly,
                noUi,
                {
                  group: ["node:*", "node:*/**"],
                  message: "Logic packages take data and return data; files and processes stay in the app's service."
                },
                {
                  group: packageImports([...readers, ...edge]),
                  message: "A pure package depends only on other pure packages."
                }
              ]
            }
          ]
        }
      },
      {
        files: packageFiles(readers),
        rules: {
          "eslint/no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "node:fs",
                  importNames: [
                    ...fileWrites,
                    ...fileWrites.map((name) => `${name}Sync`),
                    "createWriteStream",
                    "promises"
                  ],
                  message: readOnly
                },
                { name: "node:fs/promises", importNames: fileWrites, message: readOnly },
                {
                  name: "node:child_process",
                  message: "Reader packages don't start processes; the project service does."
                }
              ],
              patterns: [
                appOnly,
                noUi,
                { group: packageImports(edge), message: "A reader package depends only on pure and reader packages." }
              ]
            }
          ]
        }
      },
      {
        files: packageFiles(edge),
        rules: { "eslint/no-restricted-imports": ["error", { patterns: [appOnly] }] }
      },
      {
        // builder-vite drives a customer's own Vite, and its tests start a stock Vite server outside the Vite+ override
        // (pnpm-workspace.yaml), so it keeps stock `vite` and `vitest` imports.
        files: ["packages/builder-vite/**"],
        rules: { "vite-plus/prefer-vite-plus-imports": "off" }
      },
      {
        // The test runs the module builder-vite generates, which it has as a string. A disable comment for a type-aware
        // rule would fail `vp check`, which lints without types and so reports it unused.
        files: ["packages/builder-vite/src/index.test.ts"],
        rules: { "typescript/no-implied-eval": "off" }
      },
      {
        // reportError is the one place that shows an error notification itself; everything else calls it.
        files: ["apps/desktop/src/renderer/report-error.ts"],
        rules: { "eslint/no-restricted-properties": "off" }
      },
      {
        // Tests may use Node to set up files and folders.
        files: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
        rules: { "eslint/no-restricted-imports": ["error", { patterns: [appOnly] }] }
      },
      ...notYetClean.map(({ files, rules }) => ({
        files,
        rules: Object.fromEntries(rules.map((rule) => [rule, "off" as const]))
      }))
    ]
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "apps/*/.storybook/*.test.ts",
      "apps/*/scripts/*.test.ts",
      "scripts/*.test.ts"
    ],
    // One worker per core on CI: four on its Ubuntu and Windows runners, three on macOS, where four workers each with
    // Chrome left too little for any. Locally twelve, which Copacker's tests settled on for this machine.
    maxWorkers: process.env.CI ? availableParallelism() : 12,
    // Closing Chrome after the browser tests takes more than the default 10 seconds on CI's macOS runners, and starting
    // it with a bundle (frame.test.ts, frame-nodes.test.ts) took more than 30 on its macOS and Windows runners (PAR-533).
    // A hook that passes a timeout of its own skips this, so the browser tests' hooks don't (PAR-645).
    hookTimeout: process.env.CI ? 60_000 : 30_000,
    // CI's Windows runners take longer than the default 5 seconds over whichever tests run slowest, a different few
    // each run, with Chrome and the fixture projects on four cores. Locally a slow test still fails at 5.
    testTimeout: process.env.CI ? 20_000 : 5_000,
    // A page in Chrome can take more than the default second to show a change on CI's runners (PAR-533).
    expect: { poll: { timeout: process.env.CI ? 5_000 : 1_000 } }
  },
  // The checks, as tasks so Vite Task replays one whose inputs haven't changed since it last passed, here and in CI.
  // `pnpm verify` runs `check` and `test`, and `pnpm check:types` runs `types`; a task can't share a script's name.
  run: {
    cache: true,
    tasks: {
      // Format and lint, without types.
      check: { command: "vp check", cache: { input: trackedInputs } },
      // The unit tests, without the end-to-end suite that `pnpm test:app` runs.
      test: { command: "vp test run", cache: { input: trackedInputs } },
      // Lint with the type-aware rules, and type errors, which the push and CI check. Not cached: on macOS, Vite Task
      // doesn't see the files TypeScript's Go compiler reads (vite-task#587, fixed with TypeScript 7.1), so it could
      // replay a pass after a change broke the types. A run takes about 5 seconds.
      types: { command: "vp lint --type-aware --type-check", cache: false }
    }
  },
  // The pre-commit hook checks only what the commit stages, fixing what it can, so other sessions' unfinished work in
  // the same folder never fails it; types wait for the push. CI checks everything on a clean checkout. Lint and format
  // run separately because `vp check` fails when either finds nothing to check, such as a commit of only images or of
  // the example project, which both ignore.
  staged: {
    "*": ["vp lint --fix --no-error-on-unmatched-pattern", "vp fmt --no-error-on-unmatched-pattern"]
  }
})
