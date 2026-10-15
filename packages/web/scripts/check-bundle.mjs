/**
 * The production bundle check (checklist C9, A20, C3): run after `yarn build`, it fails when the built site in
 * `packages/web/dist` carries a test double, loads a script or stylesheet from another origin, carries an inline script in
 * a page, or lacks a file the deploy depends on.
 *
 *   node packages/web/scripts/check-bundle.mjs [distDirectory]
 *
 * The directory defaults to packages/web/dist. One given on the command line is resolved against the working directory
 * and must lie inside the repository, symbolic links followed; anything else is refused before a file is read.
 *
 * Exit code 0 when the bundle is clean; 1 with one line per problem otherwise. Findings name a file and a kind of
 * marker, never the matching text. Operator tooling: it is not part of the application and never ships.
 */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const DEFAULT_DIST = fileURLToPath(new URL("../dist", import.meta.url));

/** The repository root: a directory given on the command line must lie inside it. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Files the deploy cannot work without (C1 to C3: the headers file, the app page, the runner page and its bootstrap). */
const REQUIRED_FILES = ["index.html", "_headers", "__runner/index.html", "__runner/bootstrap.js"];

/** Extensions of files that hold no text worth scanning. */
const BINARY_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".wasm", ".mp4", ".webm", ".pdf"]);

/** The directories of `packages/web/src/test/` (ARCHITECTURE.md 1.5); a test keeps this list equal to the directory. */
const TEST_DIRECTORIES = ["atlas", "data", "routing", "runner", "safe-content", "shell", "wallet"];

/**
 * A fixture host is a name under a reserved TLD that the test doubles use as the authority of a URL
 * (`https://wallet.invalid`, `https://rpc.example/…`). Only the URL form counts: property accesses, CSS classes and
 * dotted names inside library strings (zod's `Symbol.for("zod.compile.invalid")`) are not hosts.
 */
const HOST_PREFIX = String.raw`\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*`;

/** A pattern matching any of `texts` literally. */
function literally(texts) {
  return new RegExp(texts.map((text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join("|"));
}

/**
 * Texts the test doubles of `src/test/` carry as string literals, which a minified build keeps: their error messages,
 * the fake runner's answer, the fixture meta-evidence title and the markdown corpus. The bundle check test builds every
 * module of `src/test/` minified and proves each one leaves at least one marker that survives minification.
 */
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

/**
 * What a test double leaves in a bundle. Minified code loses identifiers but keeps strings, so most markers are strings
 * the doubles and their fixtures contain (ARCHITECTURE.md 1.5); the double names and test paths catch a build that keeps
 * identifiers or ships a source map.
 */
export const TEST_DOUBLE_MARKERS = [
  { label: "test directory path", pattern: new RegExp(String.raw`src\/test\/|\/test\/(?:${TEST_DIRECTORIES.join("|")})\/`) },
  { label: "fixture host", pattern: new RegExp(String.raw`${HOST_PREFIX}\.(?:invalid|example)(?![\w-]|\.[a-z0-9])`, "i") },
  { label: "wagmi mock connector", pattern: /Mock Connector/ },
  { label: "test wallet address", pattern: /0x00000000000000000000000000000000000a11ce/i },
  { label: "test transaction hash", pattern: /0x(?:1{64}|2{64})(?![0-9a-f])/i },
  { label: "Playwright harness route", pattern: /__runner-e2e|foreign-parent\.test/ },
  { label: "golden harness provider", pattern: /io\.kleros\.golden-harness|isGoldenHarness|Golden harness \(read-only\)/ },
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

/** Whether a URL leaves the page's origin: it names a scheme or is protocol-relative. */
function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim());
}

/** The ASCII whitespace that separates the tokens of a `rel` attribute. */
const HTML_WHITESPACE = /[\t\n\f\r ]+/;

/** The value of an element's attribute as the parser kept it (the first of duplicates, name lowercased), or undefined. */
function attribute(element, name) {
  return element.attrs.find((candidate) => candidate.name === name)?.value;
}

/** Whether a `rel` value names the stylesheet relation; its tokens match ASCII case-insensitively, as a browser matches them. */
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

/** The text a script element carries between its tags. */
function scriptText(element) {
  return element.childNodes
    .filter((child) => child.nodeName === "#text")
    .map((child) => child.value)
    .join("");
}

/** What one element contributes: an external script or stylesheet it loads, or the inline script it carries. */
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

/** What one parse of a document shows, element by element. */
function findingsOf(document) {
  return [...elementsOf(document)].flatMap(findingsOfElement);
}

/**
 * The external scripts and stylesheets an HTML document loads and the inline scripts it carries, as short descriptions
 * without the URL or the script. The document is parsed as a browser parses it, so comments, tag case, quoting and
 * malformed markup end where the browser ends them. It is parsed twice, with scripting enabled and disabled, because
 * the two read `<noscript>` differently and a resource either reading finds is one some browser loads. Parsing loads
 * nothing: parse5 is a parser only and neither fetches a resource nor runs a script.
 */
function htmlFindings(html) {
  return new Set([true, false].flatMap((scriptingEnabled) => findingsOf(parse(html, { scriptingEnabled }))));
}

/** Every file below `directory`, as paths relative to it with forward slashes, sorted. */
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

async function requiredFileProblems(distDirectory) {
  const problems = [];
  for (const name of REQUIRED_FILES) {
    const location = path.join(distDirectory, name);
    let size;
    try {
      size = (await stat(location)).size;
    } catch {
      problems.push(`dist/${name} is missing.`);
      continue;
    }
    if (size === 0) problems.push(`dist/${name} is empty.`);
  }
  return problems;
}

/**
 * Checks a built site. Resolves to `{ problems, scanned }`: the problems as sentences (empty when the bundle is
 * clean) and the number of text files scanned.
 */
export async function checkBundle(distDirectory = DEFAULT_DIST) {
  if (!(await isDirectory(distDirectory))) return { problems: [`dist/ does not exist. Run yarn build first.`], scanned: 0 };
  const problems = await requiredFileProblems(distDirectory);
  let scanned = 0;
  for (const name of await filesBelow(distDirectory)) {
    if (BINARY_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
    const text = await readFile(path.join(distDirectory, name), "utf8");
    scanned += 1;
    for (const marker of TEST_DOUBLE_MARKERS) {
      if (marker.pattern.test(text)) problems.push(`dist/${name} contains a ${marker.label} (C9).`);
    }
    if (name.endsWith(".html")) {
      for (const finding of htmlFindings(text)) problems.push(`dist/${name} ${finding} (A20).`);
    }
  }
  return { problems, scanned };
}

/** Whether `location` is the repository root or lies below it. */
function isInsideRepository(location, root) {
  return location === root || location.startsWith(root + path.sep);
}

/**
 * The dist directory a command-line argument names: `{ ok: true, directory }` when it resolves inside the repository,
 * symbolic links included, else `{ ok: false, problem }`. No argument means packages/web/dist.
 */
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
  console.info(`Bundle check passed: ${String(scanned)} text files scanned, no test double, no external script or stylesheet, no inline script, deploy files present.`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
