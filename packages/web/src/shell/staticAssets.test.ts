import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(import.meta.dirname, "../..");
const SHELL_DIR = import.meta.dirname;

function read(path: string): string {
  return readFileSync(join(WEB_ROOT, path), "utf8");
}

/** index.html parsed as the browser parses it, so tag case, quoting and whitespace before `>` cannot hide an element. */
function indexDocument(): Document {
  return new DOMParser().parseFromString(read("index.html"), "text/html");
}

/** The `src` of every `<script>` and the `href` of every `<link>`, as written in the document. */
function scriptAndLinkUrls(document: Document): readonly string[] {
  const scripts = [...document.querySelectorAll("script[src]")].map((element) => element.getAttribute("src") ?? "");
  const links = [...document.querySelectorAll("link[href]")].map((element) => element.getAttribute("href") ?? "");
  return [...scripts, ...links];
}

/** An absolute URL with a scheme, or a protocol-relative one. */
function isExternal(url: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url.trim());
}

/** Shell's production sources: everything in the directory except tests. */
function productionSources(): readonly string[] {
  return readdirSync(SHELL_DIR)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => readFileSync(join(SHELL_DIR, name), "utf8"));
}

describe("index.html and the global stylesheet (A20)", () => {
  it("A20: index.html loads no external script or stylesheet", () => {
    const urls = scriptAndLinkUrls(indexDocument());
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(isExternal)).toEqual([]);
  });

  it("A20: index.html has no inline script", () => {
    const scripts = [...indexDocument().querySelectorAll("script")];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script.textContent.trim()).toBe("");
  });

  it("A20: the stylesheet self-hosts Open Sans (400, 600, 700; latin and latin-ext) and loads nothing remote", () => {
    const css = read("src/index.css");
    const fontFiles = [...css.matchAll(/src:\s*url\("([^"]+)"\)/g)].map((match) => match[1]);
    const expected = ["400", "600", "700"].flatMap((weight) => ["latin", "latin-ext"].map((subset) => `@fontsource/open-sans/files/open-sans-${subset}-${weight}-normal.woff2`));
    expect(fontFiles).toEqual(expected);
    const imports = [...css.matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(imports.filter(isExternal)).toEqual([]);
    expect(css).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it("§11.1: the stylesheet uses Open Sans as the sans-serif family", () => {
    expect(read("src/index.css")).toMatch(/--font-sans:\s*"Open Sans"/);
  });
});

describe("shell production code (C9)", () => {
  it("C9: no production file of shell imports a test double", () => {
    const sources = productionSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).not.toMatch(/from\s+["'](?:\.{1,2}\/)+test(?:\/|["'])/);
      expect(source).not.toMatch(/from\s+["']vitest["']|@testing-library/);
    }
  });
});
