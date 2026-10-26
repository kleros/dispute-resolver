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

function thumbColour(selector: string): string {
  const value = declarations(block(APP_CSS, selector)).get("background-color");
  if (value === undefined) throw new Error(`${selector} sets no background-color`);
  return value;
}

/** The thumb half of Firefox's `scrollbar-color`, which takes one colour for every state. */
function standardThumbColour(): string {
  const value = declarations(block(block(APP_CSS, "@supports not selector(::-webkit-scrollbar)"), "html")).get("scrollbar-color");
  if (value === undefined) throw new Error("the standard scrollbar branch sets no scrollbar-color");
  return /^(var\([^)]+\)|#[\da-f]+)/i.exec(value)?.[1] ?? value;
}

describe("page scrollbar", () => {
  const states = {
    "at rest": "html::-webkit-scrollbar-thumb",
    "on hover": "html::-webkit-scrollbar-thumb:hover",
    "while dragged": "html::-webkit-scrollbar-thumb:active",
  } as const;

  for (const theme of ["light", "dark"] as const) {
    for (const [state, selector] of Object.entries(states)) {
      it(`the thumb keeps at least 3:1 against the ${theme} page ${state}`, () => {
        const page = colour("var(--klerosUIComponentsLightBackground)", theme);
        expect(contrast(colour(thumbColour(selector), theme), page)).toBeGreaterThanOrEqual(3);
      });
    }

    it(`Firefox draws the ${theme} thumb in the colour other engines show at rest`, () => {
      expect(colour(standardThumbColour(), theme)).toBe(colour(thumbColour(states["at rest"]), theme));
    });
  }
});
