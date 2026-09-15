# API reference

## Plugin

The package exports `plugin` as both a named and default export. Oxlint
loads the default. There is no shared config; enable each rule
explicitly.

The package is an ES module and requires Node.js 20.19 or later.
`eslint.config.mjs` is the documented path. Node.js 20.19 and 22.12 added
`require` for ES modules, so a CommonJS `eslint.config.js` also works on
those versions or later.

## Experimental project API

The experimental `project` export exposes the information used by the
rules. Its shapes may change before 1.0:

| Method                                             | Returns                                                |
| -------------------------------------------------- | ------------------------------------------------------ |
| `projectFor(fromFile: string)`                     | Project metadata, or `null`                            |
| `themeFileFor(fromFile: string)`                   | Theme CSS path, or `null`                              |
| `colorTokensFor(fromFile: string)`                 | `Set<string>` of color names, or `null`                |
| `componentsFor(fromFile: string)`                  | Component index with `dir`, `files`, `has`, and `owns` |
| `variantDefinitionsOf(file: string)`               | Definitions with `name`, `axes`, and `source`          |
| `variantNamesFor(file: string, component: string)` | Variant names, or `null`                               |

Pass a file in the project to the discovery methods, and a component's
defining file to the variant methods:

```ts
import { resolve } from "node:path"
import { project } from "@shadcn/lint"

const theme = project.themeFileFor(resolve("src/app/page.tsx"))
const variants = project.variantNamesFor(
  resolve("src/components/ui/button.tsx"),
  "Button"
)
```

## Programmatic lint API

`lintFiles(paths, config)` runs the rules without a host linter configuration.
This is useful when Biome is the project's primary linter and formatter. It
uses `oxc-parser` directly and has no ESLint runtime dependency.

```ts
import { lintFiles } from "@shadcn/lint"

const diagnostics = await lintFiles(["src"], {
  cwd: process.cwd(),
  rules: {
    "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    "shadcn/no-raw-colors": "error",
  },
})
```

Each diagnostic includes an absolute file path, source range, severity, rule
ID, message, and any replacement suggestions. `settings`, `files`, and
`ignores` accept the corresponding plugin configuration values.

## Editor completion

Importing the plugin adds completion for all six rule names in ESLint
flat configs on ESLint 9.39 or later; earlier versions lint the same
but do not type the options. Oxlint's static JSON schema does not provide completion
for JavaScript plugin rules. The grammar, category table, collector,
and caches are internal APIs.
