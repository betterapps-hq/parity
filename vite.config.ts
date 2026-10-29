import { defineConfig } from "vite-plus"

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
    // Type-checking here is what `tsc -p tsconfig.json` did, on TypeScript 7. It needs type-aware linting on.
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: true,
      typeCheck: true
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
        files: ["packages/**", "apps/*/scripts/**"],
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
      }
    ]
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"]
  },
  run: {
    cache: true
  }
})
