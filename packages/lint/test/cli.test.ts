import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

describe("CLI", () => {
  test("loads TypeScript configuration and emits JSON diagnostics", () => {
    const fixture = path.join(PACKAGE_DIR, "test/fixtures/project")
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-cli-"))
    const config = path.join(configDir, "config.ts")
    fs.writeFileSync(
      config,
      `export default ${JSON.stringify({
        cwd: fixture,
        rules: { "shadcn/no-unknown-classes": "warn" },
      })}`
    )

    try {
      const result = spawnSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "src/cli.ts",
          "--config",
          config,
          "--format",
          "json",
          "app/oxlint.tsx",
        ],
        { cwd: PACKAGE_DIR, encoding: "utf8" }
      )

      expect(result.status, result.stderr).toBe(1)
      const diagnostics = JSON.parse(result.stdout)
      expect(
        diagnostics.some(
          (item: { ruleId: string }) =>
            item.ruleId === "shadcn/no-unknown-classes"
        )
      ).toBe(true)
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })

  test("loads the shadcnLint key from components.json", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-biome-"))
    fs.writeFileSync(
      path.join(fixture, "components.json"),
      JSON.stringify({
        shadcnLint: {
          rules: { "shadcn/no-unknown-classes": "error" },
        },
      })
    )
    fs.writeFileSync(
      path.join(fixture, "page.tsx"),
      `export const Page = () => <div className="flex-cols" />`
    )

    try {
      const result = spawnSync(
        "pnpm",
        [
          "--dir",
          PACKAGE_DIR,
          "exec",
          "tsx",
          path.join(PACKAGE_DIR, "src/cli.ts"),
          "--cwd",
          fixture,
          "--format",
          "json",
          "page.tsx",
        ],
        { cwd: fixture, encoding: "utf8" }
      )

      expect(result.status, result.stderr).toBe(1)
      expect(JSON.parse(result.stdout)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "shadcn/no-unknown-classes" }),
        ])
      )
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  })
})
