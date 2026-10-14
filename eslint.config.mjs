import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

// Security rules, each maps to a row of docs/parity/03-security-checklist.md.
const restrictedSyntax = [
  {
    selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    message: "Assigning to innerHTML/outerHTML is forbidden. Render through React, or use textContent.",
  },
  {
    selector: "AssignmentExpression[left.property.value=/^(innerHTML|outerHTML)$/]",
    message: "Assigning to innerHTML/outerHTML is forbidden. Render through React, or use textContent.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML is forbidden. Render through React.",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]",
    message: "document.write is forbidden.",
  },
];

const rehypeRawBan = { group: ["rehype-raw", "rehype-raw/*"], message: "rehype-raw lets untrusted markdown inject raw HTML and is forbidden." };

const coreBannedImports = [
  rehypeRawBan,
  {
    group: [
      "react",
      "react/*",
      "react-dom",
      "react-dom/*",
      "react-router",
      "react-router/*",
      "wagmi",
      "wagmi/*",
      "@reown/*",
      "@kleros/kleros-app",
      "@kleros/kleros-app/*",
      "@kleros/ui-components-library",
      "@kleros/ui-components-library/*",
      "@tanstack/react-query",
      "@tanstack/react-query-*",
    ],
    message: "core has no React, no wallet stack and no UI library. Keep it free of the DOM so it can run anywhere.",
  },
];

const coreBannedGlobals = ["window", "document", "localStorage", "sessionStorage", "navigator"].map((name) => ({
  name,
  message: "core must not touch the DOM or browser storage. Take what you need as an injected parameter.",
}));

// Rules requested in packages/web/ARCHITECTURE.md section 1.4. Each is explained where it is used.
const webSrc = "packages/web/src";
const webTestFiles = [`${webSrc}/**/*.test.{ts,tsx}`, `${webSrc}/test/**`];

// ARCHITECTURE.md 1.4 rule 1 (section 4): only env/env.ts reads import.meta.env.
const importMetaEnvSyntax = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: "import.meta.env is read only in packages/web/src/env/env.ts. Import ENV or APP_CONFIG from env/.",
};

// ARCHITECTURE.md 1.4 rule 3 (A17, A20): anchors with an href and iframes are rendered only by safe-content/.
const anchorSyntax = {
  selector: "JSXOpeningElement[name.name='a']:has(JSXAttribute[name.name='href'])",
  message: "A JSX <a href> is allowed only under packages/web/src/safe-content/. Use ExternalLink, or react-router's Link for in-app navigation.",
};
const iframeSyntax = {
  selector: "JSXOpeningElement[name.name='iframe']",
  message: "A JSX <iframe> is allowed only under packages/web/src/safe-content/.",
};

// ARCHITECTURE.md 1.4 rule 4 (A17): the library's FileViewer renders attachments inline.
const fileViewerPath = {
  name: "@kleros/ui-components-library",
  importNames: ["FileViewer"],
  message: "FileViewer is banned (A17): attachments are never rendered inline. Use Attachment from safe-content.",
};

// ARCHITECTURE.md 1.4 rule 4: reads go through core and the data layer (section 5), never through wagmi's read hooks.
const wagmiReadHooksPath = {
  name: "wagmi",
  importNames: ["usePublicClient", "useReadContract", "useReadContracts", "useBalance", "useBlockNumber", "useClient"],
  message: "wagmi read hooks are banned. Reads go through core and the data layer; wagmi only signs.",
};

// ARCHITECTURE.md 1.4 rule 4 (section 1.3): a directory is imported through its index only.
const dirs = "env|parity|ui|shell|routing|wallet|data|runner|atlas|safe-content";
const pageDirs = "ongoing|create|case|case-summary|case-appeal|case-evidence";
const deepImportPattern = {
  regex: `^(?:\\.{1,2}/)+(?:(?:${dirs}|pages/(?:${pageDirs}))|(?:${pageDirs}))/(?!index(?:\\.[jt]sx?)?$).+`,
  message: "Import another directory through its index (../<dir>), not through its files.",
};

// ARCHITECTURE.md 1.4 rule 5 (C9): nothing outside tests and src/test/ imports from src/test/.
const testImportPattern = {
  regex: "^(?:\\.{1,2}/)+test(?:/.*)?$",
  message: "src/test/ is for tests only (C9). A production file must not import it.",
};

// Builds the web no-restricted-imports option. The flags lift the single-directory exceptions of rule 4.
const webImports = ({ reown = true, markdown = true, app = true, testImports = true } = {}) => [
  "error",
  {
    paths: [fileViewerPath, wagmiReadHooksPath],
    patterns: [
      rehypeRawBan,
      deepImportPattern,
      ...(reown ? [{ group: ["@reown/*"], message: "@reown/* is used only under packages/web/src/wallet/ (section 2.3)." }] : []),
      ...(markdown ? [{ group: ["react-markdown", "react-markdown/*"], message: "react-markdown is used only under packages/web/src/safe-content/ (SafeMarkdown)." }] : []),
      ...(app ? [{ group: ["@kleros/kleros-app", "@kleros/kleros-app/*"], message: "@kleros/kleros-app is used only under packages/web/src/atlas/ (section 8)." }] : []),
      ...(testImports ? [testImportPattern] : []),
    ],
  },
];

export default defineConfig([
  globalIgnores([
    // The old app, kept as read-only reference until the hand-off phase.
    "src/**",
    "public/**",
    "scripts/**",
    "build/**",
    // Documentation, dependencies and generated output.
    "docs/**",
    ".yarn/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/playwright-report/**",
    "**/.vite/**",
  ]),

  js.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    // Config files are plain JavaScript and sit outside every tsconfig.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  sonarjs.configs.recommended,

  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-imports": ["error", { patterns: [rehypeRawBan] }],
      "no-restricted-syntax": ["error", ...restrictedSyntax],
    },
  },

  {
    files: ["packages/web/**/*.{ts,tsx}"],
    extends: [react.configs.flat.recommended, react.configs.flat["jsx-runtime"], reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
    settings: { react: { version: "detect" } },
    rules: {
      "react/no-danger": "error",
    },
  },

  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...coreBannedGlobals],
      "no-restricted-imports": ["error", { patterns: coreBannedImports }],
    },
  },
  // ARCHITECTURE.md 1.4 rules 1 and 3: import.meta.env, JSX <a href> and JSX <iframe> are confined to one directory each.
  {
    files: [`${webSrc}/**/*.{ts,tsx}`],
    rules: { "no-restricted-syntax": ["error", ...restrictedSyntax, importMetaEnvSyntax, anchorSyntax, iframeSyntax] },
  },
  {
    // Rule 1 override: env.ts is the one reader of import.meta.env.
    files: [`${webSrc}/env/env.ts`],
    rules: { "no-restricted-syntax": ["error", ...restrictedSyntax, anchorSyntax, iframeSyntax] },
  },
  {
    // Rule 3 override: safe-content renders the links and frames.
    files: [`${webSrc}/safe-content/**/*.{ts,tsx}`],
    rules: { "no-restricted-syntax": ["error", ...restrictedSyntax, importMetaEnvSyntax] },
  },

  // ARCHITECTURE.md 1.4 rules 4 and 5: restricted imports. A later block replaces an earlier one wholesale, so each
  // exception directory gets the full list minus its own entry, in a production variant and a test variant.
  { files: [`${webSrc}/**/*.{ts,tsx}`], rules: { "no-restricted-imports": webImports() } },
  { files: webTestFiles, rules: { "no-restricted-imports": webImports({ testImports: false }) } },
  ...[
    ["wallet", { reown: false }],
    ["safe-content", { markdown: false }],
    ["atlas", { app: false }],
  ].flatMap(([dir, lift]) => [
    { files: [`${webSrc}/${dir}/**/*.{ts,tsx}`], ignores: webTestFiles, rules: { "no-restricted-imports": webImports(lift) } },
    { files: [`${webSrc}/${dir}/**/*.test.{ts,tsx}`], rules: { "no-restricted-imports": webImports({ ...lift, testImports: false }) } },
  ]),

  {
    // ARCHITECTURE.md 1.4 rule 2 (ADR 0004, section 7): the runner page evaluates the fetched script, and this is the only
    // file in web allowed to. The script is untrusted but runs in an opaque-origin sandboxed iframe whose header CSP and
    // message-port-only channel are the containment (B1, C4, C7); evaluating it is the runner's purpose.
    files: [`${webSrc}/runner/page/evaluate.ts`],
    rules: { "no-eval": "off", "no-implied-eval": "off", "no-new-func": "off", "sonarjs/code-eval": "off" },
  },
]);
