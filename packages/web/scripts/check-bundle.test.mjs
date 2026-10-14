import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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

  it("C9: does not mistake a dotted library symbol name such as zod.compile.invalid for a fixture host", async () => {
    assert.deepEqual(await problemsOf({ "assets/index-abc.js": "const k=Symbol.for(`zod.compile.invalid`);const j=\"a.b.example\";" }), []);
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

  const EXTERNAL_SCRIPT = '<script src="https://cdn.org/x.js"></script>';
  const EXTERNAL_STYLESHEET = '<link rel="stylesheet" href="https://cdn.org/x.css">';

  for (const [name, markup] of Object.entries({
    "nested comment openers, the first --> closing both": `<!-- <!-- ${EXTERNAL_SCRIPT} --> -->`,
    "a comment left open to the end of the document": `<!-- ${EXTERNAL_SCRIPT}`,
    "a comment opener written inside a comment": `<!-- a <!-- b ${EXTERNAL_STYLESHEET} c -->`,
  })) {
    it(`A20 (js/incomplete-multi-character-sanitization): ignores an external resource hidden by ${name}`, async () => {
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
    it(`A20 (js/incomplete-multi-character-sanitization): finds an external resource after ${name}`, async () => {
      const problems = await problemsOf({ "index.html": INDEX_HTML.replace("</head>", `${markup}</head>`) });
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], /index\.html loads an external/);
    });
  }

  it("A20: finds an external script whose end tag has whitespace before the >", async () => {
    const problems = await problemsOf({ "index.html": INDEX_HTML.replace("</head>", '<script src="https://cdn.org/x.js"></script ></head>') });
    assert.equal(problems.length, 1, problems.join("\n"));
  });
});

describe("A20: the built pages carry no inline script", () => {
  const INLINE_SCRIPT = "<script>globalThis.injected=true;</script >";

  for (const [name, markup] of Object.entries({
    "an inline script whose end tag has whitespace before the >": INLINE_SCRIPT,
    "an inline script in an uppercase tag": "<SCRIPT TYPE=module>globalThis.injected=true;</SCRIPT>",
    "an inline script next to an external source": '<script src="/assets/a.js">globalThis.injected=true;</script>',
  })) {
    it(`A20: rejects ${name} in index.html without quoting it`, async () => {
      const problems = await problemsOf({ "index.html": INDEX_HTML.replace("</head>", `${markup}</head>`) });
      assert.equal(problems.length, 1, problems.join("\n"));
      assert.match(problems[0], /dist\/index\.html contains an inline script \(A20\)/);
      assert.doesNotMatch(problems[0], /injected/);
    });
  }

  it("A20: rejects an inline script in the runner page", async () => {
    const problems = await problemsOf({ "__runner/index.html": RUNNER_HTML.replace("</body>", `${INLINE_SCRIPT}</body>`) });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /__runner\/index\.html contains an inline script/);
  });

  it("A20: accepts script elements that hold only whitespace, and script text inside a comment", async () => {
    const html = INDEX_HTML.replace("</head>", '<script src="/assets/b.js">\n  </script><!-- <script>globalThis.injected=true;</script> --></head>');
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

describe("S8707: the dist directory argument stays inside the repository", () => {
  const scriptPath = fileURLToPath(new URL("./check-bundle.mjs", import.meta.url));
  const defaultDist = fileURLToPath(new URL("../dist", import.meta.url));
  const runScript = promisify(execFile);

  it("S8707: no argument checks packages/web/dist", async () => {
    assert.deepEqual(await distDirectoryFrom(undefined), { ok: true, directory: defaultDist });
  });

  it("S8707: accepts a directory inside the repository, relative or absolute", async () => {
    assert.deepEqual(await distDirectoryFrom("dist"), { ok: true, directory: path.resolve("dist") });
    assert.deepEqual(await distDirectoryFrom(defaultDist), { ok: true, directory: defaultDist });
  });

  for (const [name, argument] of Object.entries({
    "a relative path that climbs out": "../../../../../../../../etc",
    "an absolute path outside": path.parse(process.cwd()).root,
    "a sibling whose name starts with the repository's": `${fileURLToPath(new URL("../../..", import.meta.url)).replace(/[\\/]$/, "")}-copy/dist`,
  })) {
    it(`S8707: refuses ${name}`, async () => {
      const target = await distDirectoryFrom(argument);
      assert.equal(target.ok, false);
      assert.match(target.problem, /inside the repository/);
    });
  }

  it("S8707: refuses a link inside the repository that points outside it", async () => {
    const root = path.join(scratch, "repository");
    const outside = path.join(scratch, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(root, "dist"), "dir");
    const target = await distDirectoryFrom(path.join(root, "dist"), root);
    assert.equal(target.ok, false);
  });

  it("S8707: the command line refuses a directory outside the repository before reading it", async () => {
    await assert.rejects(runScript(process.execPath, [scriptPath, path.parse(process.cwd()).root]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /must lie inside the repository/);
      assert.doesNotMatch(error.stderr, /Bundle check/);
      return true;
    });
  });
});
