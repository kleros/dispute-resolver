/**
 * Usage, after `yarn build`: node packages/web/scripts/check-bundle.mjs [distDirectory]
 * The directory defaults to packages/web/dist; an argument is resolved against the cwd and must lie inside the repository,
 * symbolic links followed, else it is refused before any file is read. Exit code 0 when the bundle is clean, 1 with one
 * line per problem otherwise. Findings name a file and a kind of marker, never the matching text.
 */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const DEFAULT_DIST = fileURLToPath(new URL("../dist", import.meta.url));

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const REQUIRED_FILES = ["index.html", "_headers", "__runner/index.html", "__runner/bootstrap.js"];

/**
 * What `z.config({ jitless: true })` in packages/core/src/zod.ts minifies to. Without it zod compiles its parsers with the
 * Function constructor, which the page's policy forbids (no 'unsafe-eval'), and the bundler drops the call silently when
 * the side-effects exception in vite.config.ts is lost; exactly one copy means one zod, configured once.
 */
const ZOD_CONFIGURATION_MARKER = "jitless:!0";

const BINARY_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".wasm", ".mp4", ".webm", ".pdf"]);

/** The directories of `packages/web/src/test/`; a test keeps this list equal to the directory. */
const TEST_DIRECTORIES = ["atlas", "data", "routing", "runner", "safe-content", "shell", "wallet"];

/**
 * A fixture host is a name under a reserved TLD that the test doubles use as the authority of a URL
 * (`https://wallet.invalid`, `https://rpc.example/…`). Only the URL form counts: property accesses, CSS classes and
 * dotted names inside library strings (zod's `Symbol.for("zod.compile.invalid")`) are not hosts.
 */
const HOST_PREFIX = String.raw`\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*`;

function literally(texts) {
  return new RegExp(texts.map((text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join("|"));
}

/** String literals of the doubles in `src/test/`, which minification keeps; the check's test proves every module leaves one. */
const TEST_DOUBLE_TEXTS = [
  "This test runs no dynamic script.",
  "Unexpected RPC request ",
  "A fake write script must end with an outcome",
  "Unit tests have no network",
  "Tests read through core's test deps",
  "The fake modal holds an embedded wallet.",
  "The host has not attached the frame.",
  "The host transferred no port.",
  "Unexpected line in the headers file",
  "The upload did not start.",
  "Second paragraph with a soft",
];

/** Texts the doubles use as whole string literals; only a literal holding exactly the text counts. */
const TEST_DOUBLE_LITERALS = ["Test dispute", "storage is blocked", "storage is full"];

/** The fixture CIDs of `src/test/` and the signature of its session tokens ("test-signature" in base64url). */
const TEST_FIXTURE_IDENTIFIERS = ["QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", "QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU", "dGVzdC1zaWduYXR1cmU"];

/** Mostly strings, which minification keeps; the names and test paths catch a build that keeps identifiers or a source map. */
export const TEST_DOUBLE_MARKERS = [
  { label: "test directory path", pattern: new RegExp(String.raw`src\/test\/|\/test\/(?:${TEST_DIRECTORIES.join("|")})\/`) },
  { label: "fixture host", pattern: new RegExp(String.raw`${HOST_PREFIX}\.(?:invalid|example)(?![\w-]|\.[a-z0-9])`, "i") },
  { label: "wagmi mock connector", pattern: /Mock Connector/ },
  { label: "test wallet address", pattern: /0x00000000000000000000000000000000000a11ce/i },
  { label: "test transaction hash", pattern: /0x(?:1{64}|2{64})(?![0-9a-f])/i },
  { label: "Playwright harness route", pattern: /__runner-e2e|foreign-parent\.test/ },
  { label: "e2e injected wallet", pattern: /io\.kleros\.e2e-wallet|isE2eWallet|__e2eWallet|"E2E wallet"/ },
  // The e2e build's WalletConnect project ID (playwright.config.ts): a bundle holding it is the e2e build, not a deploy's.
  { label: "e2e WalletConnect placeholder", pattern: /e2e0{29}(?!0)/ },
  { label: "test double text", pattern: literally(TEST_DOUBLE_TEXTS) },
  { label: "test double literal", pattern: new RegExp(String.raw`(["'\x60])(?:${literally(TEST_DOUBLE_LITERALS).source})\1`) },
  { label: "test fixture identifier", pattern: literally(TEST_FIXTURE_IDENTIFIERS) },
  // Vitest's runtime, which a double that imports `vitest` pulls in. Kept to globals only Vitest's own code sets: a
  // library in the app bundle ships its package.json with `@testing-library/` among its devDependencies, and
  // `__vitest_worker__` is a global other code can probe to detect a test run.
  { label: "test runtime", pattern: /__vitest_(?:mocker|required|poll_takeover|error_context)__/ },
  {
    label: "test double name",
    pattern:
      /\b(?:createTestDeps|TestDataProvider|createTestQueryClient|createTestWallet|TestWalletProvider|fakeWriteController|installOfflineAppKitEnvironment|TestAtlasProvider|fakeUploader|installFakeAtlasServer|renderAtPath|renderWithProviders|createFakeRunnerEnvironment|createFakeRunnerDocument|MARKDOWN_CORPUS)\b/,
  },
];

function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim());
}

const HTML_WHITESPACE = /[\t\n\f\r ]+/;

function attribute(element, name) {
  return element.attrs.find((candidate) => candidate.name === name)?.value;
}

function isStylesheetRelation(rel) {
  return rel.split(HTML_WHITESPACE).some((token) => token.toLowerCase() === "stylesheet");
}

/** Every element of a parse5 tree in document order. A template's contents are inert and stay unvisited. */
function* elementsOf(root) {
  const pending = [...root.childNodes].reverse();
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.tagName === undefined) continue;
    yield node;
    pending.push(...[...node.childNodes].reverse());
  }
}

function scriptText(element) {
  return element.childNodes
    .filter((child) => child.nodeName === "#text")
    .map((child) => child.value)
    .join("");
}

function findingsOfElement(element) {
  if (element.tagName === "script") {
    const found = [];
    const src = attribute(element, "src");
    if (src !== undefined && isExternal(src)) found.push("loads an external script");
    if (scriptText(element).trim() !== "") found.push("contains an inline script");
    return found;
  }
  if (element.tagName === "link") {
    const href = attribute(element, "href");
    if (href !== undefined && isStylesheetRelation(attribute(element, "rel") ?? "") && isExternal(href)) return ["loads an external stylesheet"];
  }
  return [];
}

function findingsOf(document) {
  return [...elementsOf(document)].flatMap(findingsOfElement);
}

/**
 * Parsed twice, with scripting enabled and disabled: the two read `<noscript>` differently, and a resource either reading
 * finds is one some browser loads.
 */
function htmlFindings(html) {
  return new Set([true, false].flatMap((scriptingEnabled) => findingsOf(parse(html, { scriptingEnabled }))));
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort((a, b) => a.localeCompare(b));
}

async function isDirectory(location) {
  try {
    return (await stat(location)).isDirectory();
  } catch {
    return false;
  }
}

async function requiredFileProblem(distDirectory, name) {
  let size;
  try {
    size = (await stat(path.join(distDirectory, name))).size;
  } catch {
    return `dist/${name} is missing.`;
  }
  return size === 0 ? `dist/${name} is empty.` : null;
}

async function requiredFileProblems(distDirectory) {
  const problems = await Promise.all(REQUIRED_FILES.map((name) => requiredFileProblem(distDirectory, name)));
  return problems.filter((problem) => problem !== null);
}

function isAssetScript(name) {
  return /^assets\/[^/]+\.js$/.test(name);
}

function zodConfigurationProblem(count) {
  if (count === 0) return "dist/assets/: the zod configuration is missing from the bundle.";
  if (count > 1) return `dist/assets/: the zod configuration appears ${String(count)} times in the bundle, not once.`;
  return null;
}

function textFileProblems(name, text) {
  const problems = TEST_DOUBLE_MARKERS.filter((marker) => marker.pattern.test(text)).map((marker) => `dist/${name} contains a ${marker.label}.`);
  if (name.endsWith(".html")) {
    for (const finding of htmlFindings(text)) problems.push(`dist/${name} ${finding}.`);
  }
  return problems;
}

export async function checkBundle(distDirectory = DEFAULT_DIST) {
  if (!(await isDirectory(distDirectory))) return { problems: [`dist/ does not exist. Run yarn build first.`], scanned: 0 };
  const problems = await requiredFileProblems(distDirectory);
  let zodConfigurations = 0;
  const names = (await filesBelow(distDirectory)).filter((name) => !BINARY_EXTENSIONS.has(path.extname(name).toLowerCase()));
  const files = await Promise.all(names.map(async (name) => [name, await readFile(path.join(distDirectory, name), "utf8")]));
  for (const [name, text] of files) {
    if (isAssetScript(name)) zodConfigurations += text.split(ZOD_CONFIGURATION_MARKER).length - 1;
    problems.push(...textFileProblems(name, text));
  }
  const zodProblem = zodConfigurationProblem(zodConfigurations);
  if (zodProblem !== null) problems.push(zodProblem);
  return { problems, scanned: files.length };
}

function isInsideRepository(location, root) {
  return location === root || location.startsWith(root + path.sep);
}

export async function distDirectoryFrom(argument, root = REPOSITORY_ROOT) {
  if (argument === undefined) return { ok: true, directory: DEFAULT_DIST };
  const refusal = { ok: false, problem: "The dist directory must lie inside the repository; the argument names a path outside it." };
  const resolvedRoot = path.resolve(root);
  const directory = path.resolve(argument);
  if (!isInsideRepository(directory, resolvedRoot)) return refusal;
  const realRoot = await realpath(resolvedRoot);
  const realDirectory = await realpath(directory).catch(() => null);
  if (realDirectory !== null && !isInsideRepository(realDirectory, realRoot)) return refusal;
  return { ok: true, directory };
}

async function main() {
  const [argument, ...extra] = process.argv.slice(2);
  if (extra.length > 0) {
    console.error("Usage: node packages/web/scripts/check-bundle.mjs [distDirectory]");
    return 1;
  }
  const target = await distDirectoryFrom(argument);
  if (!target.ok) {
    console.error(target.problem);
    return 1;
  }
  const { problems, scanned } = await checkBundle(target.directory);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`Bundle check failed: ${String(problems.length)} problem(s).`);
    return 1;
  }
  console.info(
    `Bundle check passed: ${String(scanned)} text files scanned, no test double, no external script or stylesheet, no inline script, deploy files present, zod configured.`,
  );
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
