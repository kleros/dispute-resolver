import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkBundle, TEST_DOUBLE_MARKERS } from "./check-bundle.mjs";

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

async function problemsOf(overrides) {
  return (await checkBundle(await makeDist(overrides))).problems;
}

describe("C9: test doubles never ship", () => {
  it("C9: accepts a clean bundle", async () => {
    assert.deepEqual(await problemsOf({}), []);
  });

  it("C9: does not mistake a CSS class named invalid for a fixture host", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.css": ".invalid{color:red}.a .invalid\\:b{x:y}" }), []);
  });

  it("C9: does not mistake a property access named invalid for a fixture host", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.js": "e.invalid=!0;t.example=1;" }), []);
  });

  it("C9: rejects a .invalid fixture host", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": 'fetch("https://atlas.invalid/graphql")' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /assets\/index-abc\.js/);
    assert.match(problems[0], /fixture host/);
  });

  it("C9: rejects a .example fixture host such as rpc.example", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": "const u='https://rpc.example/mainnet';" });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /fixture host/);
  });

  it("C9: rejects the wagmi mock connector", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": 'const c={id:"mock",name:"Mock Connector",type:"mock"};' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /wagmi mock connector/);
  });

  it("C9: rejects a src/test path left in a bundle or source map", async () => {
    const problems = await problemsOf({ "assets/index-abc.js.map": '{"sources":["../../src/test/data/createTestDeps.ts"]}' });
    assert.ok(problems.some((problem) => /test directory path/.test(problem)));
  });

  it("C9: rejects the test wallet address and transaction hashes in any case", async () => {
    const problems = await problemsOf({
      "assets/index-abc.js": 'const a="0x00000000000000000000000000000000000A11CE";const h="0x' + "1".repeat(64) + '";',
    });
    assert.equal(problems.length, 2);
  });

  it("C9: rejects an exported test double name", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": "window.__x={createTestDeps:1};" });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /test double name/);
  });

  it("C9: names each offending file once per marker and never quotes the surrounding content", async () => {
    const problems = await problemsOf({ "assets/index-abc.js": "'https://a.example','https://b.example','https://c.example'" });
    assert.equal(problems.length, 1);
    assert.doesNotMatch(problems[0], /https/);
  });

  it("C9: scans a marker in the headers file and the runner files too", async () => {
    const problems = await problemsOf({ _headers: "connect-src https://rpc.example\n", "__runner/bootstrap.js": "x='//a.invalid/'" });
    assert.equal(problems.length, 2);
  });

  it("C9: the marker list names every directory under src/test", async () => {
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

describe("A20: no external script or stylesheet", () => {
  for (const [name, html] of Object.entries({
    "an https script": INDEX_HTML.replace("/assets/index-abc.js", "https://cdn.example.org/lib.js"),
    "a protocol-relative script": INDEX_HTML.replace("/assets/index-abc.js", "//cdn.org/lib.js"),
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- a clear-text stylesheet is the case under test.
    "an http stylesheet": INDEX_HTML.replace("/assets/index-abc.css", "http://cdn.org/lib.css"),
    "an uppercase tag with single quotes": INDEX_HTML.replace('<script type="module" crossorigin src="/assets/index-abc.js">', "<SCRIPT SRC='https://cdn.org/lib.js'>"),
    "an unquoted attribute": INDEX_HTML.replace('src="/assets/index-abc.js"', "src=https://cdn.org/lib.js"),
    "a stylesheet with several rel tokens": INDEX_HTML.replace(
      'rel="stylesheet" crossorigin href="/assets/index-abc.css"',
      'href="https://cdn.org/a.css" REL="alternate stylesheet"',
    ),
  })) {
    it(`A20: rejects ${name} in index.html`, async () => {
      const problems = await problemsOf({ "index.html": html });
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], /index\.html/);
      assert.match(problems[0], /external/);
    });
  }

  it("A20: rejects an external script in the runner page", async () => {
    const problems = await problemsOf({ "__runner/index.html": RUNNER_HTML.replace("/__runner/bootstrap.js", "https://cdn.org/x.js") });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /__runner\/index\.html/);
  });

  it("A20: accepts same-origin scripts, stylesheets, icons and external links that are not stylesheets", async () => {
    const html = INDEX_HTML.replace("</head>", '<link rel="icon" href="https://cdn.org/i.ico"><link rel="canonical" href="https://resolve.kleros.io/"></head>');
    assert.deepEqual(await problemsOf({ "index.html": html }), []);
  });

  it("A20: ignores an external script inside an HTML comment", async () => {
    const html = INDEX_HTML.replace("</head>", '<!-- <script src="https://cdn.org/x.js"></script> --></head>');
    assert.deepEqual(await problemsOf({ "index.html": html }), []);
  });
});

describe("C3: the deploy files exist", () => {
  for (const missing of ["_headers", "__runner/index.html", "__runner/bootstrap.js", "index.html"]) {
    it(`C3: rejects a bundle without ${missing}`, async () => {
      const problems = await problemsOf({ [missing]: null });
      assert.ok(
        problems.some((problem) => problem.includes(`dist/${missing}`) && /missing/.test(problem)),
        problems.join("\n"),
      );
    });
  }

  it("C3: rejects an empty bootstrap", async () => {
    const problems = await problemsOf({ "__runner/bootstrap.js": "" });
    assert.ok(problems.some((problem) => /bootstrap\.js is empty/.test(problem)));
  });

  it("C9: a missing dist directory asks for a build", async () => {
    const { problems } = await checkBundle(path.join(scratch, "does-not-exist"));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /yarn build/);
  });
});
