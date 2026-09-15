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
  test("loads JSON configuration and emits JSON diagnostics", () => {
    const fixture = path.join(PACKAGE_DIR, "test/fixtures/project")
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-cli-"))
    const config = path.join(configDir, "config.json")
    fs.writeFileSync(
      config,
      JSON.stringify({
        cwd: fixture,
        rules: { "shadcn/no-unknown-classes": "error" },
      })
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

      expect(result.status).toBe(1)
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
})
