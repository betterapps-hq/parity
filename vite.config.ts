import { defineConfig } from "vite-plus"

/*
 * What each package may import (PKG-1, docs/proposals/packages.md: The rule). A package is pure unless it's named below:
 * it takes data and returns data, with nothing from Node, React, tldraw or Electron, so a new package starts pure.
 */

/** Packages that read a project's files but never write them or start processes; writes go through changesets. */
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
  "Reader packages read files but never write them: return a changeset and let the project service apply it."

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
      "typescript/no-explicit-any": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/consistent-type-imports": "error",
      "eslint/no-console": "off",
      // Tests import from vitest until REPO-2 moves them to vite-plus/test. When this turns on, builder-vite stays off
      // it, since it drives a customer's own Vite.
      "vite-plus/prefer-vite-plus-imports": "off",
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
    maxWorkers: process.env.CI ? 4 : 12
  },
  run: {
    cache: true
  },
  // The pre-commit hook checks only what the commit stages, fixing what it can, so other sessions' unfinished work in
  // the same folder never fails it; types wait for the push. CI checks everything on a clean checkout. Lint and format
  // run separately because `vp check` fails when either finds nothing to check, such as a commit of only images or of
  // the example project, which both ignore.
  staged: {
    "*": ["vp lint --fix --no-error-on-unmatched-pattern", "vp fmt --no-error-on-unmatched-pattern"]
  }
})
