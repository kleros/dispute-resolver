import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Theme = "light" | "dark";

const APP_CSS = readFileSync(resolve(import.meta.dirname, "index.css"), "utf8").replaceAll(/\/\*[\s\S]*?\*\//g, "");
const LIBRARY_CSS = readFileSync(createRequire(import.meta.url).resolve("@kleros/ui-components-library/theme.css"), "utf8");

/** The text between the braces of the first block whose prelude is exactly `prelude`, braces matched. */
function block(css: string, prelude: string): string {
  const match = new RegExp(`(?:^|[\\s{}])${prelude.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`).exec(css);
  if (!match) throw new Error(`no ${prelude} block`);
  const open = match.index + match[0].length - 1;
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`the ${prelude} block is never closed`);
}

function declarations(body: string): Map<string, string> {
  const entries = body.split(/[;{}]/).flatMap((part): [string, string][] => {
    const colon = part.indexOf(":");
    const name = part.slice(0, colon).trim();
    return colon > 0 && /^[\w-]+$/.test(name) ? [[name, part.slice(colon + 1).trim()]] : [];
  });
  return new Map(entries);
}

/** Custom properties in cascade order: the app's dark block beats the library's, and both beat either `:root` block. */
function tokens(theme: Theme): readonly Map<string, string>[] {
  const light = [declarations(block(APP_CSS, ":root")), declarations(block(LIBRARY_CSS, ":root"))];
  return theme === "dark" ? [declarations(block(APP_CSS, ":root.dark")), declarations(block(LIBRARY_CSS, ":root.dark")), ...light] : light;
}

function colour(value: string, theme: Theme): string {
  const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!reference) return value.trim();
  const name = reference[1] ?? "";
  const found = tokens(theme)
    .find((scope) => scope.has(name))
    ?.get(name);
  if (found === undefined) throw new Error(`${name} is not defined in the ${theme} theme`);
  return colour(found, theme);
}

function luminance(hex: string): number {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`${hex} is not a six-digit hex colour`);
  const [r = 0, g = 0, b = 0] = [0, 2, 4]
    .map((offset) => Number.parseInt((match[1] ?? "").slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [darker, lighter] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** The library's thumb utility paints with this variable, and each state's rule redefines it. */
function thumbColour(selector: string): string {
  const value = declarations(block(APP_CSS, selector)).get("--color-klerosUIComponentsPrimaryBlue");
  if (value === undefined) throw new Error(`${selector} sets no thumb colour`);
  return value;
}

/** The thumb half of Firefox's `scrollbar-color`, which takes one colour for every state, where the document scrolls. */
function standardThumbColour(): string {
  const value = declarations(block(block(APP_CSS, "@supports not selector(::-webkit-scrollbar)"), ':root:not([data-page-scroll="container"])')).get("scrollbar-color");
  if (value === undefined) throw new Error("the standard scrollbar branch sets no scrollbar-color");
  return /^(var\([^)]+\)|#[\da-f]+)/i.exec(value)?.[1] ?? value;
}

const STATES = ["at rest", "on hover", "while dragged"] as const;

const THUMB = {
  "at rest": ".dr-page-scroller > .simplebar-track .simplebar-scrollbar::before",
  "on hover": ".dr-page-scroller > .simplebar-track .simplebar-scrollbar.simplebar-hover::before",
  "while dragged": ".dr-page-scroller.simplebar-dragging > .simplebar-track.simplebar-vertical .simplebar-scrollbar::before",
} as const;

/** The colour of the 1 px ring the thumb draws round itself, which every state keeps from the rule at rest. */
function ringColour(): string {
  const value = declarations(block(APP_CSS, THUMB["at rest"])).get("box-shadow");
  if (value === undefined) throw new Error("the thumb draws no ring");
  const ring = /^(?:0(?:px)? ){3}1px (var\(--[\w-]+\))$/.exec(value.trim());
  if (!ring) throw new Error(`the thumb's box-shadow is not a 1 px ring: ${value}`);
  return ring[1] ?? "";
}

/** The classes the header and footer bands are painted with (shell/layout.ts), read as text: shell is imported through its index only. */
const BAR_SURFACE = /export const BAR_SURFACE = `([^`]*)`/.exec(readFileSync(resolve(import.meta.dirname, "shell/layout.ts"), "utf8"))?.[1] ?? "";

/** The header and footer bands' background in a theme. */
function barSurface(theme: Theme): string {
  const pattern = theme === "dark" ? /(?:^|\s)dark:bg-(klerosUIComponents\w+)/ : /(?:^|\s)bg-(klerosUIComponents\w+)/;
  const name = pattern.exec(BAR_SURFACE)?.[1];
  if (name === undefined) throw new Error(`the bars set no ${theme} background token`);
  return `var(--${name})`;
}

describe("page scrollbar", () => {
  it("the app styles no ::-webkit-scrollbar and reserves no gutter, so where scrollbars overlay the page the browser's own floats over it", () => {
    expect(APP_CSS).not.toMatch(/::-webkit-scrollbar[\w-]*(?::[\w-]+)*\s*[,{]/);
    expect(APP_CSS).not.toMatch(/scrollbar-gutter\s*:/);
  });

  it("the hovered and dragged thumb keep the ring the thumb draws at rest", () => {
    for (const state of ["on hover", "while dragged"] as const) {
      expect(declarations(block(APP_CSS, THUMB[state])).has("box-shadow"), state).toBe(false);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    const page = colour("var(--klerosUIComponentsLightBackground)", theme);
    const bar = colour(barSurface(theme), theme);

    for (const state of STATES) {
      it(`the page scroller's thumb keeps at least 3:1 against the ${theme} page ${state}`, () => {
        expect(contrast(colour(thumbColour(THUMB[state]), theme), page)).toBeGreaterThanOrEqual(3);
      });

      it(`over the ${theme} header and footer the thumb, or the ring round it, keeps at least 3:1 ${state}`, () => {
        const thumb = colour(thumbColour(THUMB[state]), theme);
        const ring = colour(ringColour(), theme);
        expect(Math.max(contrast(thumb, bar), contrast(ring, bar))).toBeGreaterThanOrEqual(3);
      });
    }

    it(`the ring round the ${theme} thumb is the page's own colour, so it shows only where the thumb crosses the header and footer`, () => {
      expect(colour(ringColour(), theme)).toBe(page);
    });

    it(`Firefox, where the document scrolls, draws the ${theme} thumb in the page scroller's colour at rest`, () => {
      expect(colour(standardThumbColour(), theme)).toBe(colour(thumbColour(THUMB["at rest"]), theme));
    });
  }
});
