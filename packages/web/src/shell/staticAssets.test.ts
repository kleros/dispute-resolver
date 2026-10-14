import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(import.meta.dirname, "../..");
const SHELL_DIR = import.meta.dirname;

function read(path: string): string {
  return readFileSync(join(WEB_ROOT, path), "utf8");
}

/** Every `<script>` and `<link>` start tag of an HTML document. */
function scriptAndLinkTags(html: string): readonly string[] {
  return [...html.matchAll(/<(script|link)\b[^>]*>/gi)].map((match) => match[0]);
}

/** The `src` and `href` values of a tag; index.html writes every attribute in double quotes. */
function urlsOf(tag: string): readonly string[] {
  return [...tag.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((match) => match[1] ?? "");
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
    const tags = scriptAndLinkTags(read("index.html"));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag.match(/\b(?:src|href)=/g)?.length ?? 0).toBe(urlsOf(tag).length);
    expect(tags.flatMap(urlsOf).filter(isExternal)).toEqual([]);
  });

  it("A20: index.html has no inline script", () => {
    const scripts = [...read("index.html").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, , body] of scripts) expect(body?.trim()).toBe("");
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
