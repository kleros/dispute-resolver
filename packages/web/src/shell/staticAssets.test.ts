import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { ImgHTMLAttributes, ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./BrandLogo";

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

describe("index.html and the global stylesheet", () => {
  it("index.html loads no external script or stylesheet", () => {
    const urls = scriptAndLinkUrls(indexDocument());
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(isExternal)).toEqual([]);
  });

  it("index.html has no inline script", () => {
    const scripts = [...indexDocument().querySelectorAll("script")];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script.textContent.trim()).toBe("");
  });

  it("the stylesheet self-hosts Open Sans (400, 600, 700; latin and latin-ext) and loads nothing remote", () => {
    const css = read("src/index.css");
    const fontFiles = [...css.matchAll(/src:\s*url\("([^"]+)"\)/g)].map((match) => match[1]);
    const expected = ["400", "600", "700"].flatMap((weight) => ["latin", "latin-ext"].map((subset) => `@fontsource/open-sans/files/open-sans-${subset}-${weight}-normal.woff2`));
    expect(fontFiles).toEqual(expected);
    const imports = [...css.matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(imports.filter(isExternal)).toEqual([]);
    expect(css).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it("the stylesheet uses Open Sans as the sans-serif family", () => {
    expect(read("src/index.css")).toMatch(/--font-sans:\s*"Open Sans"/);
  });

  it("no stylesheet the app loads turns on smooth scrolling, so reduced motion needs no scroll guard", () => {
    const libraryAssets = dirname(createRequire(import.meta.url).resolve("@kleros/ui-components-library/style.css"));
    const libraryStylesheets = readdirSync(libraryAssets).filter((name) => name.endsWith(".css"));
    expect(libraryStylesheets).toContain("scrollbar.css");
    for (const css of [read("src/index.css"), ...libraryStylesheets.map((name) => readFileSync(join(libraryAssets, name), "utf8"))]) {
      expect(css).not.toMatch(/scroll-behavior\s*:\s*smooth/);
    }
    const sources = readdirSync(join(WEB_ROOT, "src"), { recursive: true, encoding: "utf8" }).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) expect(read(join("src", name)), name).not.toMatch(/\bscroll-smooth\b/);
  });
});

describe("tab title", () => {
  it("the tab title is Dispute Resolver while the logo keeps the full product name", () => {
    expect(indexDocument().title).toBe("Dispute Resolver");
    const logo: ReactElement<ImgHTMLAttributes<HTMLImageElement>> = BrandLogo();
    expect(logo.props.alt).toBe("Kleros Dispute Resolver");
  });
});

describe("web-app manifest", () => {
  it("index.html links manifest.json, which public/ ships", () => {
    const links = [...indexDocument().querySelectorAll('link[rel="manifest"]')].map((element) => element.getAttribute("href"));
    expect(links).toEqual(["/manifest.json"]);
  });

  it("manifest.json carries the app's name, icon, standalone display and colors", () => {
    expect(JSON.parse(read("public/manifest.json"))).toEqual({
      short_name: "Dispute Resolver",
      name: "Dispute Resolver",
      icons: [{ src: "favicon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }],
      start_url: ".",
      display: "standalone",
      theme_color: "#000000",
      background_color: "#ffffff",
    });
    expect(readdirSync(join(WEB_ROOT, "public"))).toContain("favicon.ico");
  });
});

describe("shell production code", () => {
  it("no production file of shell imports a test double", () => {
    const sources = productionSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).not.toMatch(/from\s+["'](?:\.{1,2}\/)+test(?:\/|["'])/);
      expect(source).not.toMatch(/from\s+["']vitest["']|@testing-library/);
    }
  });
});
