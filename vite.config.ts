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
const packageImports = (names: string[]) => names.flatMap((name) => [`@parity/${name}`, `@parity/${name}/**`])

/** What no package imports. */
const appOnly = {
  group: ["electron", "tldraw", "@tldraw/*", "@parity/desktop", "@parity/desktop/**", "**/apps/**"],
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
    plugins: ["eslint", "typescript", "react", "vitest", "jsx-a11y", "import", "oxc", "unicorn", "promise"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    categories: {
      correctness: "error"
    },
    // Types are checked on push and in CI, not on commit or in `pnpm verify`: `pnpm check:types` runs this lint with
    // `--type-aware --type-check`, which adds the type-aware rules and what `tsc -p tsconfig.json` did, on TypeScript 7.
    options: {
      reportUnusedDisableDirectives: "error"
    },
    ignorePatterns: [
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
      // The agency monorepo's rules beyond the correctness category (PAR-396, docs/proposals/repository.md: From the
      // agency monorepo), without `curly`, `no-console`, `no-bitwise` and the React Compiler rule.
      "typescript/no-inferrable-types": "error",
      "typescript/adjacent-overload-signatures": "error",
      "typescript/no-empty-interface": "error",
      "typescript/no-namespace": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/restrict-plus-operands": "error",
      "eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      "eslint/no-new-wrappers": "error",
      "eslint/no-empty": "error",
      "eslint/no-new": "error",
      "eslint/no-var": "error",
      "eslint/prefer-const": "error",
      "eslint/radix": "error",
      "eslint/eqeqeq": "error",
      "eslint/no-new-func": "error",
      "eslint/prefer-rest-params": "error",
      "eslint/prefer-spread": "error",
      "eslint/no-fallthrough": "error",
      "eslint/no-inner-declarations": "error",
      "eslint/no-prototype-builtins": "error",
      "eslint/no-regex-spaces": "error",
      "eslint/no-empty-function": "error",
      "eslint/no-array-constructor": "error",
      "eslint/no-implied-eval": "error",
      "eslint/no-nested-ternary": "error",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-array-flat": "error",
      "unicorn/prefer-array-flat-map": "error",
      "unicorn/prefer-array-some": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-logical-operator-over-ternary": "error",
      "unicorn/prefer-structured-clone": "error",
      "unicorn/throw-new-error": "error",
      "unicorn/no-zero-fractions": "error",
      "react/no-danger": "error",
      "react/rules-of-hooks": "error",
      "react/display-name": "error",
      "react/no-unstable-nested-components": "error",
      "react/jsx-no-comment-textnodes": "error",
      "react/jsx-no-target-blank": "error",
      "react/no-unescaped-entities": "error",
      "react/no-unknown-property": "error",
      "react/require-render-return": "error",
      "typescript/no-explicit-any": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/consistent-type-imports": "error",
      "eslint/no-console": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
      // Type-aware rules that flagged 229 places on 2026-10-29, left for REPO-7 to turn on with the fixes.
      "typescript/unbound-method": "off",
      "typescript/no-base-to-string": "off",
      "typescript/restrict-template-expressions": "off",
      "typescript/no-misused-spread": "off",
      "typescript/no-redundant-type-constituents": "off",
      "typescript/no-floating-promises": "off",
      "typescript/await-thenable": "off",
      "typescript/no-implied-eval": "off"
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
        files: ["apps/desktop/src/renderer/components/ui/**"],
        rules: {
          "jsx-a11y/prefer-tag-over-role": "off",
          "jsx-a11y/click-events-have-key-events": "off",
          "jsx-a11y/no-noninteractive-element-interactions": "off"
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
        // Tests may use Node to set up files and folders.
        files: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
        rules: { "eslint/no-restricted-imports": ["error", { patterns: [appOnly] }] }
      }
    ]
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "apps/*/.storybook/*.test.ts",
      "scripts/*.test.ts"
    ],
    // CI's runners have four cores. Locally twelve, which Copacker's tests settled on for this machine.
    maxWorkers: process.env.CI ? 4 : 12,
    // Closing Chrome after the browser tests takes more than the default 10 seconds on CI's macOS runners.
    hookTimeout: 30_000,
    // CI's Windows runners take longer than the default 5 seconds over whichever tests run slowest, a different few
    // each run, with Chrome and the fixture projects on four cores. Locally a slow test still fails at 5.
    testTimeout: process.env.CI ? 20_000 : 5_000
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
