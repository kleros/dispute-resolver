/**
 * The production bundle check (checklist C9, A20, C3): run after `yarn build`, it fails when the built site in
 * `packages/web/dist` carries a test double, loads a script or stylesheet from another origin, or lacks a file the
 * deploy depends on.
 *
 *   node packages/web/scripts/check-bundle.mjs [distDirectory]
 *
 * Exit code 0 when the bundle is clean; 1 with one line per problem otherwise. Findings name a file and a kind of
 * marker, never the matching text. Operator tooling: it is not part of the application and never ships.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DIST = fileURLToPath(new URL("../dist", import.meta.url));

/** Files the deploy cannot work without (C1 to C3: the headers file, the app page, the runner page and its bootstrap). */
const REQUIRED_FILES = ["index.html", "_headers", "__runner/index.html", "__runner/bootstrap.js"];

/** Extensions of files that hold no text worth scanning. */
const BINARY_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".wasm", ".mp4", ".webm", ".pdf"]);

/** The directories of `packages/web/src/test/` (ARCHITECTURE.md 1.5); a test keeps this list equal to the directory. */
const TEST_DIRECTORIES = ["atlas", "data", "routing", "runner", "safe-content", "shell", "wallet"];

/** A fixture host is a name under a reserved TLD that tests use, in a string or a URL. Property accesses and CSS classes are not. */
const HOST_PREFIX = String.raw`(?:\/\/|["'\x60])[a-z0-9-]+(?:\.[a-z0-9-]+)*`;

/**
 * What a test double leaves in a bundle. Minified code loses identifiers but keeps strings, so the markers are the
 * strings the doubles and their fixtures contain (ARCHITECTURE.md 1.5), plus the double names for builds that keep them.
 */
export const TEST_DOUBLE_MARKERS = [
  { label: "test directory path", pattern: new RegExp(String.raw`src\/test\/|\/test\/(?:${TEST_DIRECTORIES.join("|")})\/`) },
  { label: "fixture host", pattern: new RegExp(String.raw`${HOST_PREFIX}\.(?:invalid|example)(?![\w-]|\.[a-z0-9])`, "i") },
  { label: "wagmi mock connector", pattern: /Mock Connector/ },
  { label: "test wallet address", pattern: /0x00000000000000000000000000000000000a11ce/i },
  { label: "test transaction hash", pattern: /0x(?:1{64}|2{64})(?![0-9a-f])/i },
  { label: "Playwright harness route", pattern: /__runner-e2e|foreign-parent\.test/ },
  {
    label: "test double name",
    pattern:
      /\b(?:createTestDeps|TestDataProvider|createTestQueryClient|createTestWallet|TestWalletProvider|fakeWriteController|installOfflineAppKitEnvironment|TestAtlasProvider|fakeUploader|installFakeAtlasServer|renderAtPath|renderWithProviders|createFakeRunnerEnvironment|createFakeRunnerDocument|MARKDOWN_CORPUS)\b/,
  },
];

const ATTRIBUTE_VALUE = String.raw`"[^"]*"|'[^']*'|[^\s>]+`;
const ATTRIBUTE = new RegExp(String.raw`([^\s=/>"']+)(?:\s*=\s*(${ATTRIBUTE_VALUE}))?`, "g");

/** Splits the attributes of one tag into a lowercase-name map; a name without a value maps to the empty string. */
function attributesOf(source) {
  const attributes = new Map();
  for (const [, rawName, rawValue = ""] of source.matchAll(ATTRIBUTE)) {
    const name = rawName.toLowerCase();
    if (!attributes.has(name)) attributes.set(name, rawValue.replace(/^(["'])(.*)\1$/s, "$2"));
  }
  return attributes;
}

/** Whether a URL leaves the page's origin: it names a scheme or is protocol-relative. */
function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim());
}

/** The attribute text of the tag whose name ends at `start`: everything up to the first `>` outside quotes. */
function tagSource(html, start) {
  let quote = "";
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote !== "") {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return html.slice(start, index);
    }
  }
  return html.slice(start);
}

/** The external scripts and stylesheets an HTML document loads, as short descriptions without the URL. */
function externalResources(html) {
  const withoutComments = html.replaceAll(/<!--[\s\S]*?-->/g, "");
  const found = [];
  for (const match of withoutComments.matchAll(/<(script|link)\b/gi)) {
    const attributes = attributesOf(tagSource(withoutComments, match.index + match[0].length));
    if (match[1].toLowerCase() === "script") {
      const src = attributes.get("src");
      if (src !== undefined && isExternal(src)) found.push("script");
    } else {
      const href = attributes.get("href");
      const relations = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
      if (href !== undefined && relations.includes("stylesheet") && isExternal(href)) found.push("stylesheet");
    }
  }
  return found;
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
      for (const kind of new Set(externalResources(text))) problems.push(`dist/${name} loads an external ${kind} (A20).`);
    }
  }
  return { problems, scanned };
}

async function main() {
  const { problems, scanned } = await checkBundle(process.argv[2] === undefined ? DEFAULT_DIST : path.resolve(process.argv[2]));
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`Bundle check failed: ${String(problems.length)} problem(s).`);
    return 1;
  }
  console.info(`Bundle check passed: ${String(scanned)} text files scanned, no test double, no external script or stylesheet, deploy files present.`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
