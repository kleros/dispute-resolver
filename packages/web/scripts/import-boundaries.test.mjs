import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

// The import boundaries of the eslint configuration that keep test-only code out of the production bundle (C9): a
// production file under packages/web/src imports neither src/test/ nor the Playwright harness under e2e/.

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** The no-restricted-imports patterns eslint applies to `file` (relative to the repository root). */
async function restrictedPatterns(file) {
  const config = await new ESLint({ cwd: REPOSITORY_ROOT }).calculateConfigForFile(file);
  const [, options] = config.rules["no-restricted-imports"] ?? [];
  return options?.patterns ?? [];
}

function isBanned(patterns, specifier) {
  return patterns.some((pattern) => pattern.regex !== undefined && new RegExp(pattern.regex).test(specifier));
}

describe("C9: production files never import test-only code", () => {
  for (const file of ["packages/web/src/pages/case/CasePage.tsx", "packages/web/src/wallet/WalletControl.tsx", "packages/web/src/pages/case/CasePage.test.tsx"]) {
    it(`C9: ${file} may not import the Playwright harness under e2e/`, async () => {
      const patterns = await restrictedPatterns(file);
      for (const specifier of ["../../../e2e/support/wallet", "../../e2e/support/wallet.ts", "../../e2e/runner/rpcFixture", "../../e2e"]) {
        assert.ok(isBanned(patterns, specifier), `${specifier} is not banned in ${file}`);
      }
    });
  }

  it("C9: the ban does not reach a module whose name merely contains e2e", async () => {
    assert.equal(isBanned(await restrictedPatterns("packages/web/src/pages/case/CasePage.tsx"), "./e2eFlow"), false);
  });
});
