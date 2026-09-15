// Packs @shadcn/lint the way `npm publish` would, installs the tarball
// into a fresh project outside the workspace, and lints that project
// with ESLint and with Oxlint. Catches what unit tests cannot: the
// exports map, the ESM build and its worker, the oxc-parser runtime, the copied
// README, and the messages users see. Run: node scripts/smoke-install.mjs

import { execSync, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-smoke-"))
const run = (cmd, cwd = dir) =>
  execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" })
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}

let failures = 0
const expect = (label, out, needle) => {
  const ok = needle instanceof RegExp ? needle.test(out) : out.includes(needle)
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`)
  if (!ok) {
    failures++
    console.log(
      out
        .split("\n")
        .slice(0, 40)
        .map((l) => "     " + l)
        .join("\n")
    )
  }
}

try {
  // 1. Pack.
  const packOut = run(
    `pnpm pack --pack-destination ${JSON.stringify(dir)}`,
    PKG_DIR
  )
  const tarball = packOut.trim().split("\n").pop()
  const listing = run(`tar -tzf ${JSON.stringify(tarball)}`)
  expect("tarball has the ESM build", listing, "package/dist/index.js")
  expect("tarball has the standalone CLI", listing, "package/dist/cli.js")
  expect(
    "tarball has the Tailwind worker",
    listing,
    "package/dist/tailwind-worker.js"
  )
  expect(
    "tarball has no CommonJS build",
    listing,
    /^(?![\s\S]*package\/dist\/[^\n]*\.cjs\n)/
  )
  expect("tarball has README.md", listing, "package/README.md")
  expect(
    "tarball has no source or scripts",
    listing,
    /^(?![\s\S]*package\/(src|scripts|test)\/)/
  )

  // 2. A small shadcn-shaped project.
  write(
    "package.json",
    JSON.stringify({ name: "smoke", private: true, type: "module" }, null, 2)
  )
  write(
    "components.json",
    JSON.stringify({
      aliases: { components: "@/components", ui: "@/components/ui" },
      tailwind: { css: "app/globals.css" },
    })
  )
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        jsx: "preserve",
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
    })
  )
  write(
    "app/globals.css",
    `@import "tailwindcss";\n@theme inline {\n  --color-primary: var(--primary);\n  --color-muted: var(--muted);\n  --color-muted-foreground: var(--muted-foreground);\n  --radius-lg: var(--radius);\n}\n:root {\n  --radius: 0.625rem;\n  --primary: oklch(0.205 0 0);\n  --muted: oklch(0.97 0 0);\n  --muted-foreground: oklch(0.556 0 0);\n}\n`
  )
  write(
    "components/ui/button.tsx",
    `import { cva } from "class-variance-authority"\nexport const buttonVariants = cva("inline-flex", { variants: { variant: { default: "bg-primary", ghost: "bg-transparent" } } })\nexport function Button({ className, variant, ...props }: any) {\n  return <button className={buttonVariants({ variant, className })} {...props} />\n}\n`
  )
  write(
    "components/save-button.tsx",
    `import { Button } from "@/components/ui/button"\nexport function SaveButton({ className }: { className?: string }) {\n  return <Button className={className}>Save</Button>\n}\n`
  )
  write(
    "app/page.tsx",
    `import { Button } from "@/components/ui/button"\nimport { SaveButton } from "@/components/save-button"\nexport default function Page() {\n  return (\n    <div className="bg-zinc-100 rounded-[10px] text-primry flex-cols hovr:flex">\n      <Button className="bg-pink-500 mt-4">Go</Button>\n      <SaveButton className="rounded-full" />\n    </div>\n  )\n}\n`
  )
  write(
    "eslint.config.mjs",
    `import { plugin as shadcn } from "@shadcn/lint"\nimport parser from "@typescript-eslint/parser"\nexport default [\n  { files: ["**/*.tsx"], languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { shadcn }, rules: { "shadcn/no-restyle": ["error", { allow: ["layout"] }], "shadcn/no-raw-colors": "error", "shadcn/no-arbitrary-values": "error", "shadcn/no-inline-styles": "error", "shadcn/require-static-classes": "error", "shadcn/no-unknown-classes": "error" } },\n  { files: ["components/ui/**"], rules: { "shadcn/no-restyle": "off", "shadcn/require-static-classes": "off", "shadcn/no-arbitrary-values": "off" } },\n]\n`
  )
  write(
    ".oxlintrc.json",
    JSON.stringify({
      jsPlugins: ["@shadcn/lint"],
      categories: { correctness: "off" },
      rules: {
        "shadcn/no-restyle": ["error", { allow: ["layout"] }],
        "shadcn/no-raw-colors": "error",
        "shadcn/no-arbitrary-values": "error",
        "shadcn/no-unknown-classes": "error",
      },
      overrides: [
        {
          files: ["components/ui/**"],
          rules: {
            "shadcn/no-restyle": "off",
            "shadcn/no-arbitrary-values": "off",
          },
        },
      ],
    })
  )
  write(
    "shadcn-lint.config.json",
    JSON.stringify({
      rules: {
        "shadcn/no-restyle": ["error", { allow: ["layout"] }],
        "shadcn/no-raw-colors": "error",
        "shadcn/no-arbitrary-values": "error",
        "shadcn/no-unknown-classes": "error",
      },
    })
  )

  // 3. Install the standalone package first. Biome-first consumers must not
  // receive ESLint through the package's runtime dependency tree.
  run(`pnpm add -D --ignore-workspace ${JSON.stringify(tarball)} tailwindcss@4`)
  const installed = JSON.parse(
    fs.readFileSync(
      path.join(dir, "node_modules/@shadcn/lint/package.json"),
      "utf-8"
    )
  )
  // The optional parser must resolve from the installed package itself.
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require("node:module"); const r = createRequire(require.resolve("@shadcn/lint", { paths: [process.cwd()] })); try { r("oxc-parser"); console.log("oxc") } catch (e) { console.log("none: " + e.message) }`,
    ],
    { cwd: dir, encoding: "utf-8" }
  )
  expect(
    `installed @shadcn/lint@${installed.version}; oxc-parser resolves from it`,
    probe.stdout + probe.stderr,
    /^oxc/
  )
  expect(
    "standalone install has no ESLint runtime",
    fs.existsSync(path.join(dir, "node_modules/eslint")) ? "eslint" : "clean",
    "clean"
  )
  write(
    "standalone.ts",
    `import { lintFiles } from "@shadcn/lint"\nvoid lintFiles(["app"], { rules: {} })\n`
  )
  write(
    "tsconfig.standalone.json",
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        noEmit: true,
        strict: true,
        skipLibCheck: false,
      },
      files: ["standalone.ts"],
    })
  )
  const tsc = require.resolve("typescript/bin/tsc")
  run(
    `${JSON.stringify(process.execPath)} ${JSON.stringify(tsc)} -p tsconfig.standalone.json`
  )
  expect("standalone types need no ESLint packages", "clean", "clean")

  // Host-linter compatibility remains optional.
  run(
    "pnpm add -D --ignore-workspace eslint@9 @typescript-eslint/parser oxlint"
  )

  // 4. ESLint.
  const eslint = spawnSync("npx", ["eslint", "app/page.tsx"], {
    cwd: dir,
    encoding: "utf-8",
    // npx is a .cmd shim on Windows and needs a shell there.
    shell: process.platform === "win32",
  })
  const eout = eslint.stdout + eslint.stderr
  expect(
    "eslint: boundary on Button lists variants",
    eout,
    /"bg-pink-500" is not allowed on <Button>: <Button> owns its color\. Use a variant: default, ghost\. Add a new variant in components\/ui\/button\.tsx/
  )
  expect(
    "eslint: boundary through the wrapper",
    eout,
    /"rounded-full" is not allowed on <SaveButton>: <SaveButton> forwards className to <Button>, which owns its shape/
  )
  expect(
    "eslint: nearest token for a palette class",
    eout,
    /"bg-zinc-100" uses the raw Tailwind palette\. Nearest theme tokens: bg-muted\./
  )
  expect(
    "eslint: typo",
    eout,
    /"text-primry" is not a declared theme color\. Did you mean "text-primary"\?/
  )
  expect(
    "eslint: radius from the theme",
    eout,
    /"rounded-\[10px\]" hardcodes an off-token value\. Use "rounded-lg" instead/
  )
  expect("eslint: layout on Button passes", eout, /^(?![\s\S]*"mt-4")/)
  expect(
    "eslint: the project's Tailwind names the typo",
    eout,
    /"flex-cols" is not a class this project's Tailwind knows, so no CSS is generated for it\. Did you mean "flex-col"\?/
  )
  expect(
    "eslint: an invented variant",
    eout,
    /"hovr:flex" is not a class[\s\S]*Did you mean "hover:flex"\?/
  )
  expect(
    "eslint: no fallback warning",
    eout,
    /^(?![\s\S]*could not be consulted)/
  )

  // 5. Oxlint.
  const oxlint = spawnSync("npx", ["oxlint", "app/page.tsx"], {
    cwd: dir,
    encoding: "utf-8",
    // npx is a .cmd shim on Windows and needs a shell there.
    shell: process.platform === "win32",
  })
  const oout = oxlint.stdout + oxlint.stderr
  expect(
    "oxlint: plugin loads and reports",
    oout,
    /shadcn\(no-restyle\): "bg-pink-500" is not allowed on <Button>/
  )
  expect("oxlint: wrapper", oout, /<SaveButton> forwards className to <Button>/)
  expect("oxlint: nearest token", oout, /Nearest theme tokens: bg-muted\./)
  expect("oxlint: radius", oout, /Use "rounded-lg" instead/)
  expect(
    "oxlint: the project's Tailwind answers inside Oxlint too",
    oout,
    /"flex-cols" is not a class[\s\S]*Did you mean "flex-col"\?/
  )
  expect(
    "oxlint: no fallback warning",
    oout,
    /^(?![\s\S]*could not be consulted)/
  )

  // 6. Standalone command for Biome-first projects.
  const standalone = spawnSync(
    "npx",
    ["shadcn-lint", "--format", "json", "app/page.tsx"],
    {
      cwd: dir,
      encoding: "utf-8",
      shell: process.platform === "win32",
    }
  )
  const sout = standalone.stdout + standalone.stderr
  expect("standalone: exits on violations", String(standalone.status), "1")
  expect(
    "standalone: reports JSON rule ids",
    sout,
    '"ruleId": "shadcn/no-restyle"'
  )
  expect(
    "standalone: keeps project-aware messages",
    sout,
    "Use a variant: default, ghost"
  )
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log("\nsmoke install passed")
