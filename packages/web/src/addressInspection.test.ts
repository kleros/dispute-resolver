// @vitest-environment node
import { resolve } from "node:path";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

// 06-intro (docs/parity/06-registry-schema.md, CLAUDE.md hard rules): UI code never inspects a contract address; it asks
// core's registry for the family and the overrides. The root eslint configuration enforces it in every production file
// under packages/web/src, and leaves test files free to hold the fixture addresses they need.

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");
const RULES = ["no-restricted-syntax", "no-restricted-imports"] as const;

const PRODUCTION_FILES = [
  "packages/web/src/data/useCase.ts",
  "packages/web/src/pages/case-appeal/AppealSection.tsx",
  "packages/web/src/env/env.ts",
  "packages/web/src/safe-content/evidenceDisplay.ts",
  "packages/web/src/wallet/useWallet.ts",
  "packages/web/src/atlas/useLibraryUploader.ts",
];
const TEST_FILES = ["packages/web/src/test/data/fixtures.ts", "packages/web/src/pages/case/CasePage.test.tsx", "packages/web/src/safe-content/ExternalLink.test.tsx"];

const ARBITRABLE = "0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb";
const CHECKSUMMED = "0xC5E9dDebb09Cd64DfaCab4011A0D5cEDaf7c9BDb";

const eslint = new ESLint({ cwd: REPOSITORY_ROOT });

/** The address rules eslint applies to `file`, run alone over `code` (no type information is needed for them). */
async function addressFindings(file: string, code: string): Promise<string[]> {
  const config: unknown = await eslint.calculateConfigForFile(file);
  const rules = (config as { rules: Partial<Record<(typeof RULES)[number], Linter.RuleEntry>> }).rules;
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(
    code,
    [{ files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser }, rules: Object.fromEntries(RULES.map((rule) => [rule, rules[rule] ?? "off"])) }],
    resolve(REPOSITORY_ROOT, file),
  );
  return messages
    .filter((message) => message.fatal !== true)
    .map((message) => message.message)
    .filter((message) => message.includes("06-intro"));
}

describe("06-intro: UI code never inspects a contract address", () => {
  for (const file of PRODUCTION_FILES) {
    it(`06-intro: ${file} may not hold an address literal`, async () => {
      expect(await addressFindings(file, `export const SPECIAL = "${ARBITRABLE}";`)).toHaveLength(1);
      expect(await addressFindings(file, `export const SPECIAL = "${CHECKSUMMED}";`)).toHaveLength(1);
      expect(await addressFindings(file, `export const SPECIAL = \`${ARBITRABLE}\`;`)).toHaveLength(1);
    });

    it(`06-intro: ${file} may not branch on an arbitrable, arbitrator or proxy address`, async () => {
      const declarations = "declare const binding: { arbitrated: string }; declare const arbitrable: string; declare const proxy: string; declare const other: string;";
      for (const comparison of ["binding.arbitrated === other", "other !== arbitrable", "binding.arbitrated.toLowerCase() === other", "other == proxy.toLowerCase()"]) {
        expect(await addressFindings(file, `${declarations} export const special = ${comparison};`), comparison).toHaveLength(1);
      }
      expect(await addressFindings(file, `${declarations} switch (binding.arbitrated) { default: }`)).toHaveLength(1);
      expect(await addressFindings(file, `import { isAddressEqual } from "viem"; export { isAddressEqual };`)).toHaveLength(1);
    });

    it(`06-intro: ${file} may still check that an address is known`, async () => {
      const code = [
        "declare const binding: { arbitrated: string } | undefined; declare const arbitrable: string | undefined; declare const hasArbitrator: boolean;",
        "export const loading = arbitrable === undefined || binding?.arbitrated === undefined || hasArbitrator !== true;",
        `export const TX_HASH = "0x${"11".repeat(32)}"; export const SELECTOR = "0x8a9bb02a";`,
        "export const ADDRESS = /^0x[0-9a-f]{40}$/;",
      ].join("\n");
      expect(await addressFindings(file, code)).toEqual([]);
    });
  }

  for (const file of TEST_FILES) {
    it(`06-intro: ${file} is a test file and may hold fixture addresses`, async () => {
      expect(await addressFindings(file, `export const TEST_ARBITRABLE = "${ARBITRABLE}"; export const same = TEST_ARBITRABLE === "${CHECKSUMMED}";`)).toEqual([]);
    });
  }
});
