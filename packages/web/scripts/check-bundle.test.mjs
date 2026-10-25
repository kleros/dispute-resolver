import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "vite";
import { checkBundle, distDirectoryFrom, TEST_DOUBLE_MARKERS } from "./check-bundle.mjs";

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Kleros Dispute Resolver</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>
  <body><div id="root"></div></body>
</html>`;
const RUNNER_HTML = `<!doctype html><html><head><title>Runner</title></head><body><script src="/__runner/bootstrap.js"></script></body></html>`;
const CLEAN_FILES = {
  "index.html": INDEX_HTML,
  _headers: "/*\n  X-Content-Type-Options: nosniff\n",
  "__runner/index.html": RUNNER_HTML,
  "__runner/bootstrap.js": "(function(){})();",
  "assets/index-abc.js": 'export const rpc="https://eth-mainnet.g.alchemy.com";',
  "assets/index-abc.css": ".invalid\\:border-red:is(:where(.x)){color:red}",
  "assets/core-abc.js": "Z.config({jitless:!0});",
};

const scratch = await mkdtemp(path.join(tmpdir(), "check-bundle-"));
after(() => rm(scratch, { recursive: true, force: true }));
let counter = 0;

/** A dist directory holding the clean files with `overrides` applied; a `null` override removes the file. */
async function makeDist(overrides = {}) {
  counter += 1;
  const root = path.join(scratch, `dist-${String(counter)}`);
  const files = { ...CLEAN_FILES, ...overrides };
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue;
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

/** The same URL over plain http, built rather than written so the clear-text form appears only where it is under test. */
function clearTextUrl(secureUrl) {
  const url = new URL(secureUrl);
  url.protocol = "http:";
  return url.href;
}

async function problemsOf(overrides) {
  return (await checkBundle(await makeDist(overrides))).problems;
}

describe("test doubles never ship", () => {
  it("accepts a clean bundle", async () => {
    assert.deepEqual(await problemsOf({}), []);
  });

  it("does not mistake a CSS class named invalid for a fixture host", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.css": ".invalid{color:red}.a .invalid\\:b{x:y}" }), []);
  });

  it("does not mistake a property access named invalid for a fixture host", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.js": "e.invalid=!0;t.example=1;" }), []);
  });

  it("does not mistake a dotted library symbol name such as zod.compile.invalid for a fixture host", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.js": 'const k=Symbol.for(`zod.compile.invalid`);const j="a.b.example";' }), []);
  });

  const singleMarkers = [
    { name: "rejects a .invalid fixture host", file: "assets/index-abc.js", text: 'fetch("https://atlas.invalid/graphql")', label: /fixture host/ },
    { name: "rejects a .example fixture host such as rpc.example", file: "assets/index-abc.js", text: "const u='https://rpc.example/mainnet';", label: /fixture host/ },
    { name: "rejects the wagmi mock connector", file: "assets/index-abc.js", text: 'const c={id:"mock",name:"Mock Connector",type:"mock"};', label: /wagmi mock connector/ },
    { name: "rejects an exported test double name", file: "assets/index-abc.js", text: "window.__x={createTestDeps:1};", label: /test double name/ },
    {
      name: "rejects a bundle built with the e2e build's WalletConnect project ID",
      file: "assets/appKit-abc.js",
      text: 'const t={projectId:"e2e00000000000000000000000000000"};',
      label: /e2e WalletConnect placeholder/,
    },
  ];
  for (const { name, file, text, label } of singleMarkers) {
    it(name, async () => {
      const problems = await problemsOf({ [file]: text });
      assert.equal(problems.length, 1);
      assert.ok(problems[0].includes(file), problems[0]);
      assert.match(problems[0], label);
    });
  }

  it("rejects a src/test path left in a bundle or source map", async () => {
    const problems = await problemsOf({ "assets/index-abc.js.map": '{"sources":["../../src/test/data/createTestDeps.ts"]}' });
    assert.ok(problems.some((problem) => /test directory path/.test(problem)));
  });

  it("rejects the test wallet address and transaction hashes in any case", async () => {
    const problems = await problemsOf({
      "assets/index-abc.js": 'const a="0x00000000000000000000000000000000000A11CE";const h="0x' + "1".repeat(64) + '";',
    });
    assert.equal(problems.length, 2);
  });

  it("rejects a test double's message and fixture identifier", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": 'throw Error(`This test runs no dynamic script.`);const c="QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";' });
    assert.equal(problems.length, 2, problems.join("\n"));
  });

  it("rejects a string literal that is exactly a test double's literal, in any quotes", async () => {
    for (const literal of ["`Test dispute`", '"storage is blocked"', "'storage is full'"]) {
      const problems = await problemsOf({ "assets/index-abc.js": `const t=${literal};` });
      assert.equal(problems.length, 1, literal);
      assert.match(problems[0], /test double literal/);
    }
  });

  it("does not mistake app text that only contains a test double's literal for it", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.js": 'const a="Test dispute resolution";const b=`Local storage is blocked by the browser.`;' }), []);
  });

  it("rejects the injected wallet of e2e/support/wallet.ts", async () => {
    for (const marker of ['const r="io.kleros.e2e-wallet";', "const p={isE2eWallet:!0};", "window.__e2eWallet=h;", 'const n={name:"E2E wallet"};']) {
      const problems = await problemsOf({ "assets/index-abc.js": marker });
      assert.equal(problems.length, 1, marker);
      assert.match(problems[0], /e2e injected wallet/);
    }
  });

  it("names each offending file once per marker and never quotes the surrounding content", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": "'https://a.example','https://b.example','https://c.example'" });
    assert.equal(problems.length, 1);
    assert.doesNotMatch(problems[0], /https/);
  });

  it("scans a marker in the headers file and the runner files too", async () => {
    const problems = await problemsOf({ _headers: "connect-src https://rpc.example\n", "__runner/bootstrap.js": "x='//a.invalid/'" });
    assert.equal(problems.length, 2);
  });

  it("names every directory under src/test in the marker list", async () => {
    const testDirectory = fileURLToPath(new URL("../src/test", import.meta.url));
    const directories = (await readdir(testDirectory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    assert.ok(directories.length > 0);
    const pathMarker = TEST_DOUBLE_MARKERS.find((marker) => marker.label === "test directory path");
    assert.ok(pathMarker);
    for (const name of directories) {
      assert.match(`/test/${name}/x.js`, pathMarker.pattern, `${name} is not covered`);
    }
  });
});

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEST_DIRECTORY = path.join(WEB_ROOT, "src", "test");

const TEST_MODULES = (await readdir(TEST_DIRECTORY, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
  .map((entry) => path.relative(TEST_DIRECTORY, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
  .sort((a, b) => a.localeCompare(b));

describe("a minified production build that imports a test double fails the check", () => {
  /** Markers that only match identifiers or source-map paths; a minified build without a source map keeps neither. */
  const IDENTIFIER_MARKERS = new Set(["test double name", "test directory path"]);

  /**
   * Modules no marker can find once minified. `TestWalletProvider` carries no string of its own and is inert without a
   * double that is caught: it renders the app's wallet provider over a `TestWallet`, which only `createTestWallet` makes.
   * `appRoutePatterns` holds only the Netlify route patterns that every build ships in `dist/_headers`, so a marker for
   * them would flag every clean build.
   */
  const UNMARKED_MODULES = new Set(["routing/appRoutePatterns.ts", "wallet/TestWalletProvider.tsx"]);

  /** Vite's settings for a client build of this package, without its config file (no plugin, no .env). */
  const BASE_CONFIG = {
    configFile: false,
    envDir: false,
    root: WEB_ROOT,
    logLevel: "silent",
    resolve: { mainFields: ["browser", "module", "jsnext:main", "jsnext"] },
  };

  function outputsOf(result) {
    return (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
  }

  /** The names a module exports at run time, read from an unminified build of the module alone. */
  async function runtimeExports(file) {
    const result = await build({
      ...BASE_CONFIG,
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: file, preserveEntrySignatures: "strict", external: (id) => !id.startsWith(".") && !path.isAbsolute(id) },
      },
    });
    return outputsOf(result).find((output) => output.type === "chunk" && output.isEntry).exports;
  }

  /**
   * A production build (minified, no source map) of an app entry that imports each export of `file` under a local name
   * and keeps it reachable, as an app module that leaked the double would. Resolves to the text of every output file.
   */
  async function leakedBuild(file) {
    const names = await runtimeExports(file);
    const entryId = "\0leaking-entry";
    const locals = names.map((_, index) => `leaked${String(index)}`);
    const imports = names.map((name, index) => `${name} as ${locals[index]}`).join(", ");
    const source = `import { ${imports} } from ${JSON.stringify(file)};\nglobalThis.leaked = [${locals.join(", ")}];`;
    const entry = { name: "leaking-entry", resolveId: (id) => (id === "leaking-entry" ? entryId : null), load: (id) => (id === entryId ? source : null) };
    const result = await build({ ...BASE_CONFIG, plugins: [entry], build: { write: false, minify: true, sourcemap: false, rollupOptions: { input: "leaking-entry" } } });
    return outputsOf(result).map((output) => (output.type === "chunk" ? output.code : String(output.source)));
  }

  it("finds the modules of src/test", () => {
    assert.ok(TEST_MODULES.length > 10);
    for (const name of UNMARKED_MODULES) assert.ok(TEST_MODULES.includes(name), `${name} is no longer under src/test`);
  });

  /** The test-double findings, other than identifier markers, of a dist holding a minified build that imports `name`. */
  async function survivingFindings(name) {
    const outputs = await leakedBuild(path.join(TEST_DIRECTORY, name));
    const files = Object.fromEntries(outputs.map((text, index) => [`assets/leaked-${String(index)}.js`, text]));
    const problems = await problemsOf(files);
    return problems.filter((problem) => /\(C9\)\.$/.test(problem) && ![...IDENTIFIER_MARKERS].some((label) => problem.includes(`a ${label} (C9)`)));
  }

  for (const name of TEST_MODULES.filter((module) => !UNMARKED_MODULES.has(module))) {
    it(`rejects a minified build that imports src/test/${name}`, async () => {
      assert.ok((await survivingFindings(name)).length > 0, `a minified build importing src/test/${name} passes the bundle check`);
    });
  }

  for (const name of UNMARKED_MODULES) {
    it(`still finds no marker in src/test/${name}, so its exception is still needed`, async () => {
      assert.deepEqual(await survivingFindings(name), []);
    });
  }
});

describe("no external script or stylesheet", () => {
  for (const [name, html] of Object.entries({
    "an https script": INDEX_HTML.replace("/assets/index-abc.js", "https://cdn.example.org/lib.js"),
    "a protocol-relative script": INDEX_HTML.replace("/assets/index-abc.js", "//cdn.org/lib.js"),
    "an http stylesheet": INDEX_HTML.replace("/assets/index-abc.css", clearTextUrl("https://cdn.org/lib.css")),
    "an uppercase tag with single quotes": INDEX_HTML.replace('<script type="module" crossorigin src="/assets/index-abc.js">', "<SCRIPT SRC='https://cdn.org/lib.js'>"),
    "an unquoted attribute": INDEX_HTML.replace('src="/assets/index-abc.js"', "src=https://cdn.org/lib.js"),
    "a stylesheet with several rel tokens": INDEX_HTML.replace(
      'rel="stylesheet" crossorigin href="/assets/index-abc.css"',
      'href="https://cdn.org/a.css" REL="alternate stylesheet"',
    ),
    "an uppercase stylesheet relation": INDEX_HTML.replace('rel="stylesheet" crossorigin href="/assets/index-abc.css"', 'rel="STYLESHEET" href="https://cdn.org/x.css"'),
    "a mixed-case stylesheet relation": INDEX_HTML.replace('rel="stylesheet" crossorigin href="/assets/index-abc.css"', 'rel="StyleSheet" href="https://cdn.org/x.css"'),
    "a mixed-case stylesheet relation among other tokens": INDEX_HTML.replace(
      'rel="stylesheet" crossorigin href="/assets/index-abc.css"',
      'rel="preload\tAlternate STYLESHEET" href="https://cdn.org/x.css"',
    ),
    "a script that a malformed noscript hides only when scripting is disabled": INDEX_HTML.replace(
      "<body>",
      '<body><noscript><style></noscript><script src="https://cdn.org/x.js"></script>',
    ),
    "a stylesheet inside noscript, which loads when scripting is disabled": INDEX_HTML.replace(
      "</head>",
      '<noscript><link rel="stylesheet" href="https://cdn.org/x.css"></noscript></head>',
    ),
  })) {
    it(`rejects ${name} in index.html`, async () => {
      const problems = await problemsOf({ "index.html": html });
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], /index\.html/);
      assert.match(problems[0], /external/);
    });
  }

  it("rejects an external script in the runner page", async () => {
    const problems = await problemsOf({ "__runner/index.html": RUNNER_HTML.replace("/__runner/bootstrap.js", "https://cdn.org/x.js") });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /__runner\/index\.html/);
  });

  it("accepts same-origin scripts, stylesheets, icons and external links that are not stylesheets", async () => {
    const html = INDEX_HTML.replace("</head>", '<link rel="icon" href="https://cdn.org/i.ico"><link rel="canonical" href="https://resolve.kleros.io/"></head>');
    assert.deepEqual(await problemsOf({ "index.html": html }), []);
  });

  it("ignores an external script inside an HTML comment", async () => {
    const html = INDEX_HTML.replace("</head>", '<!-- <script src="https://cdn.org/x.js"></script> --></head>');
    assert.deepEqual(await problemsOf({ "index.html": html }), []);
  });

  const EXTERNAL_SCRIPT = '<script src="https://cdn.org/x.js"></script>';
  const EXTERNAL_STYLESHEET = '<link rel="stylesheet" href="https://cdn.org/x.css">';

  for (const [name, markup] of Object.entries({
    "nested comment openers, the first --> closing both": `<!-- <!-- ${EXTERNAL_SCRIPT} --> -->`,
    "a comment left open to the end of the document": `<!-- ${EXTERNAL_SCRIPT}`,
    "a comment opener written inside a comment": `<!-- a <!-- b ${EXTERNAL_STYLESHEET} c -->`,
  })) {
    it(`ignores an external resource hidden by ${name}`, async () => {
      assert.deepEqual(await problemsOf({ "index.html": INDEX_HTML.replace("</head>", `${markup}</head>`) }), []);
    });
  }

  for (const [name, markup] of Object.entries({
    "a bogus comment wrapping a comment marker, which one strip pass turns into <!--": `<!<!-- x -->-- ${EXTERNAL_SCRIPT} -->`,
    "overlapping markers <!-<!-- -->->": `<!-<!-- -->-> ${EXTERNAL_SCRIPT}`,
    "an abruptly closed <!-->": `<!-->${EXTERNAL_SCRIPT}`,
    "an abruptly closed <!--->": `<!--->${EXTERNAL_SCRIPT}`,
    "a comment closed by --!>": `<!-- x --!>${EXTERNAL_STYLESHEET}`,
    "two comments around it": `<!-- a -->${EXTERNAL_SCRIPT}<!-- b -->`,
    "a closing marker written outside any comment": `--> ${EXTERNAL_SCRIPT}`,
  })) {
    it(`finds an external resource after ${name}`, async () => {
      const problems = await problemsOf({ "index.html": INDEX_HTML.replace("</head>", `${markup}</head>`) });
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], /index\.html loads an external/);
    });
  }

  it("finds an external script whose end tag has whitespace before the >", async () => {
    const problems = await problemsOf({ "index.html": INDEX_HTML.replace("</head>", '<script src="https://cdn.org/x.js"></script ></head>') });
    assert.equal(problems.length, 1, problems.join("\n"));
  });
});

describe("the built pages carry no inline script", () => {
  const INLINE_SCRIPT = "<script>globalThis.injected=true;</script >";

  for (const [name, markup] of Object.entries({
    "an inline script whose end tag has whitespace before the >": INLINE_SCRIPT,
    "an inline script in an uppercase tag": "<SCRIPT TYPE=module>globalThis.injected=true;</SCRIPT>",
    "an inline script next to an external source": '<script src="/assets/a.js">globalThis.injected=true;</script>',
  })) {
    it(`rejects ${name} in index.html without quoting it`, async () => {
      const problems = await problemsOf({ "index.html": INDEX_HTML.replace("</head>", `${markup}</head>`) });
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], /dist\/index\.html contains an inline script \(A20\)/);
      assert.doesNotMatch(problems[0], /injected/);
    });
  }

  it("rejects an inline script in the runner page", async () => {
    const problems = await problemsOf({ "__runner/index.html": RUNNER_HTML.replace("</body>", `${INLINE_SCRIPT}</body>`) });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /__runner\/index\.html contains an inline script/);
  });

  it("accepts script elements that hold only whitespace, and script text inside a comment", async () => {
    const html = INDEX_HTML.replace("</head>", '<script src="/assets/b.js">\n  </script><!-- <script>globalThis.injected=true;</script> --></head>');
    assert.deepEqual(await problemsOf({ "index.html": html }), []);
  });
});

describe("the deploy files exist", () => {
  for (const missing of ["_headers", "__runner/index.html", "__runner/bootstrap.js", "index.html"]) {
    it(`rejects a bundle without ${missing}`, async () => {
      const problems = await problemsOf({ [missing]: null });
      assert.ok(
        problems.some((problem) => problem.includes(`dist/${missing}`) && /missing/.test(problem)),
        problems.join("\n"),
      );
    });
  }

  it("rejects an empty bootstrap", async () => {
    const problems = await problemsOf({ "__runner/bootstrap.js": "" });
    assert.ok(problems.some((problem) => /bootstrap\.js is empty/.test(problem)));
  });

  it("asks for a build when the dist directory is missing", async () => {
    const { problems } = await checkBundle(path.join(scratch, "does-not-exist"));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /yarn build/);
  });
});

describe("the zod configuration ships in the bundle", () => {
  it("fails when the bundle lacks the zod configuration marker", async () => {
    const problems = await problemsOf({ "assets/core-abc.js": "Z.config({});" });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /zod configuration is missing/);
    assert.doesNotMatch(problems[0], /jitless/);
  });

  it("fails when the bundle carries the zod configuration more than once", async () => {
    const problems = await problemsOf({ "assets/other-abc.js": "Y.config({jitless:!0});" });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /zod configuration appears 2 times/);
    assert.doesNotMatch(problems[0], /jitless/);
  });

  it("counts the marker only in the scripts under assets", async () => {
    const problems = await problemsOf({ "assets/core-abc.js": "Z.config({});", "assets/core-abc.js.map": '{"x":"jitless:!0"}', "__runner/bootstrap.js": "({jitless:!0});" });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /zod configuration is missing/);
  });
});

describe("the dist directory argument stays inside the repository", () => {
  const scriptPath = fileURLToPath(new URL("./check-bundle.mjs", import.meta.url));
  const defaultDist = fileURLToPath(new URL("../dist", import.meta.url));
  const runScript = promisify(execFile);

  it("checks packages/web/dist without an argument", async () => {
    assert.deepEqual(await distDirectoryFrom(undefined), { ok: true, directory: defaultDist });
  });

  it("accepts a directory inside the repository, relative or absolute", async () => {
    assert.deepEqual(await distDirectoryFrom("dist"), { ok: true, directory: path.resolve("dist") });
    assert.deepEqual(await distDirectoryFrom(defaultDist), { ok: true, directory: defaultDist });
  });

  for (const [name, argument] of Object.entries({
    "a relative path that climbs out": "../../../../../../../../etc",
    "an absolute path outside": path.parse(process.cwd()).root,
    "a sibling whose name starts with the repository's": `${fileURLToPath(new URL("../../..", import.meta.url)).replace(/[\\/]$/, "")}-copy/dist`,
  })) {
    it(`refuses ${name}`, async () => {
      const target = await distDirectoryFrom(argument);
      assert.equal(target.ok, false);
      assert.match(target.problem, /inside the repository/);
    });
  }

  it("refuses a link inside the repository that points outside it", async () => {
    const root = path.join(scratch, "repository");
    const outside = path.join(scratch, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(root, "dist"), "dir");
    const target = await distDirectoryFrom(path.join(root, "dist"), root);
    assert.equal(target.ok, false);
  });

  it("refuses a directory outside the repository on the command line before reading it", async () => {
    await assert.rejects(runScript(process.execPath, [scriptPath, path.parse(process.cwd()).root]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /must lie inside the repository/);
      assert.doesNotMatch(error.stderr, /Bundle check/);
      return true;
    });
  });
});
