import { ScrollbarContainer } from "@kleros/ui-components-library";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

// What the page scroller (PageScroller.tsx and its rules in index.css) relies on inside the library's ScrollbarContainer,
// SimpleBar 5 bundled in @kleros/ui-components-library 3.10.0, and in Reown AppKit 1.8's wallet modal. A release of
// either that changes any of it fails here first.

const LIBRARY_STYLESHEET = createRequire(import.meta.url).resolve("@kleros/ui-components-library/style.css");
const APPKIT_ENTRY = createRequire(import.meta.url).resolve("@reown/appkit");
const APPKIT_CLIENT = readFileSync(join(dirname(APPKIT_ENTRY), "../src/client/appkit.js"), "utf8");
const APPKIT_MODAL = readFileSync(join(dirname(createRequire(APPKIT_ENTRY).resolve("@reown/appkit-scaffold-ui/w3m-modal")), "../src/modal/w3m-modal/index.js"), "utf8");
const LIBRARY_CSS = readFileSync(LIBRARY_STYLESHEET, "utf8");
const LIBRARY_THEME = readFileSync(createRequire(import.meta.url).resolve("@kleros/ui-components-library/theme.css"), "utf8");
const SIMPLEBAR_CSS = readFileSync(join(dirname(LIBRARY_STYLESHEET), "scrollbar.css"), "utf8");
const APP_CSS = readFileSync(resolve(import.meta.dirname, "../index.css"), "utf8").replaceAll(/\/\*[\s\S]*?\*\//g, "");

const THUMB_CLASS = "[&_.simplebar-scrollbar]:before:!bg-klerosUIComponentsPrimaryBlue";
const VISIBLE_CLASS = "[&_.simplebar-visible]:before:!opacity-100";
const MASK_CLASS = "[&_.simplebar-mask]:!bg-klerosUIComponentsWhiteBackground";
const THUMB_VARIABLE = "--color-klerosUIComponentsPrimaryBlue";
const MASK_VARIABLE = "--color-klerosUIComponentsWhiteBackground";
const CONTENT_WRAPPER = ".dr-page-scroller > .simplebar-wrapper > .simplebar-mask > .simplebar-offset > .simplebar-content-wrapper";

type Specificity = readonly [number, number, number];

interface Rule {
  readonly selector: string;
  readonly body: string;
  /** The at-rules around the rule, outermost first. */
  readonly context: readonly string[];
}

/** Every style rule of `css` with the at-rules it sits in; nested rules are listed with their own selector. */
function rules(css: string): Rule[] {
  const found: Rule[] = [];
  const stack: { readonly prelude: string; readonly start: number }[] = [];
  let preludeStart = 0;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") {
      stack.push({ prelude: css.slice(preludeStart, index).trim(), start: index + 1 });
      preludeStart = index + 1;
    } else if (char === "}") {
      const open = stack.pop();
      if (open !== undefined && !open.prelude.startsWith("@")) {
        const context = stack.map((entry) => entry.prelude).filter((prelude) => prelude.startsWith("@"));
        for (const selector of open.prelude.split(",")) found.push({ selector: selector.trim(), body: css.slice(open.start, index), context });
      }
      preludeStart = index + 1;
    } else if (char === ";") {
      preludeStart = index + 1;
    }
  }
  return found;
}

const NAME_CHAR = /[\w-]/;

/** The end of the CSS name that starts at `start`, escaped characters included. */
function nameEnd(selector: string, start: number): number {
  let end = start;
  while (end < selector.length) {
    const char = selector.charAt(end);
    if (char === "\\") end += 2;
    else if (NAME_CHAR.test(char)) end += 1;
    else break;
  }
  return end;
}

/** What one simple selector at `index` adds to the specificity, and where the next one starts. */
function simpleSelector(selector: string, index: number): { readonly next: number; readonly adds: 0 | 1 | 2 | null } {
  const char = selector.charAt(index);
  if (char === "#") return { next: nameEnd(selector, index + 1), adds: 0 };
  if (char === ".") return { next: nameEnd(selector, index + 1), adds: 1 };
  if (char === "[") return { next: selector.indexOf("]", index) + 1, adds: 1 };
  if (char === ":") {
    const pseudoElement = selector.charAt(index + 1) === ":";
    const start = index + (pseudoElement ? 2 : 1);
    const next = nameEnd(selector, start);
    const legacyPseudoElement = ["before", "after"].includes(selector.slice(start, next));
    return { next, adds: pseudoElement || legacyPseudoElement ? 2 : 1 };
  }
  if (NAME_CHAR.test(char)) return { next: nameEnd(selector, index), adds: 2 };
  return { next: index + 1, adds: null };
}

/** The specificity of a selector without :is, :where or :not: ids, then classes, attributes and pseudo-classes, then types and pseudo-elements. */
function specificity(selector: string): Specificity {
  const counts = [0, 0, 0];
  let index = 0;
  while (index < selector.length) {
    const { next, adds } = simpleSelector(selector, index);
    if (adds !== null) counts[adds] = (counts[adds] ?? 0) + 1;
    index = next;
  }
  return [counts[0] ?? 0, counts[1] ?? 0, counts[2] ?? 0];
}

function outranks(a: Specificity, b: Specificity): boolean {
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
  }
  return false;
}

function escaped(char: string): string {
  return `\\${char}`;
}

/** The selector Tailwind writes for a utility class: the class escaped as CSS requires. */
function classSelector(className: string): string {
  return `.${className.replaceAll(/[[\]&.:!]/g, escaped)}`;
}

/** The library's own rule for one of its default classes, as its stylesheet ships it. */
function libraryRule(className: string): Rule {
  const prefix = `${classSelector(className)} `;
  const rule = rules(LIBRARY_CSS).find((candidate) => candidate.selector.startsWith(prefix));
  if (rule === undefined) throw new Error(`The library stylesheet has no rule for ${className}`);
  return rule;
}

function appRule(selector: string): Rule {
  const rule = rules(APP_CSS).find((candidate) => candidate.selector === selector);
  if (rule === undefined) throw new Error(`index.css has no rule for ${selector}`);
  return rule;
}

/** The value a rule body gives a property, `!important` included, or undefined when it does not declare it. */
function declared(body: string, property: string): string | undefined {
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon > 0 && declaration.slice(0, colon).trim() === property) return declaration.slice(colon + 1).trim();
  }
  return undefined;
}

/** The rule of index.css for `selector` that declares `property`. */
function appRuleDeclaring(selector: string, property: string): Rule {
  const rule = rules(APP_CSS).find((candidate) => candidate.selector === selector && declared(candidate.body, property) !== undefined);
  if (rule === undefined) throw new Error(`index.css declares no ${property} for ${selector}`);
  return rule;
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `var(--name)`, with any spacing inside the parentheses. */
function varOf(name: string): RegExp {
  return new RegExp(String.raw`var\(\s*${escapeRegExp(name)}\s*\)`);
}

function renderContainer() {
  const scroller = createRef<HTMLDivElement>();
  const { container } = render(
    <ScrollbarContainer className="dr-page-scroller" autoHide={false} scrollableNodeProps={{ ref: scroller }}>
      <p>Page content</p>
    </ScrollbarContainer>,
  );
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error("ScrollbarContainer rendered no element.");
  return { root, scroller };
}

describe("the library's ScrollbarContainer, as the page scroller uses it", () => {
  it("draws its thumb PrimaryBlue, shows it at full opacity and paints its mask WhiteBackground through three default classes, beside the app's own", () => {
    const { root } = renderContainer();
    expect(root).toHaveAttribute("data-simplebar", "init");
    expect([...root.classList].sort((a, b) => a.localeCompare(b))).toEqual(["dr-page-scroller", MASK_CLASS, THUMB_CLASS, VISIBLE_CLASS].sort((a, b) => a.localeCompare(b)));
  });

  it("scrolls in its content wrapper, the element its scrollableNodeProps ref receives, which holds the content", () => {
    const { root, scroller } = renderContainer();
    const wrapper = root.querySelector(":scope > .simplebar-wrapper > .simplebar-mask > .simplebar-offset > .simplebar-content-wrapper");
    expect(wrapper).not.toBeNull();
    expect(scroller.current).toBe(wrapper);
    expect(wrapper?.querySelector(":scope > .simplebar-content > p")).toHaveTextContent("Page content");
  });

  it("makes its content wrapper a focusable region named scrollable content, which the page scroller takes back", () => {
    const { scroller } = renderContainer();
    expect(scroller.current).toHaveAttribute("tabindex", "0");
    expect(scroller.current).toHaveAttribute("role", "region");
    expect(scroller.current).toHaveAttribute("aria-label", "scrollable content");
  });

  it("with autoHide off, marks its vertical thumb visible from the start, inside a track that is its own child", () => {
    const { root } = renderContainer();
    expect(root.querySelector(":scope > .simplebar-track.simplebar-vertical > .simplebar-scrollbar")).toHaveClass("simplebar-visible");
    expect(root.querySelector(":scope > .simplebar-track.simplebar-horizontal > .simplebar-scrollbar")).toHaveClass("simplebar-visible");
  });

  it("every selector the app's stylesheet writes for the page scroller finds its element, the hover, drag and wallet modal states set as SimpleBar and AppKit set them", () => {
    const { root } = renderContainer();
    root.classList.add("simplebar-dragging");
    root.querySelector(".simplebar-vertical .simplebar-scrollbar")?.classList.add("simplebar-hover");
    const walletModal = document.createElement("w3m-modal");
    walletModal.classList.add("open");
    document.body.append(walletModal);
    try {
      const selectors = [...new Set(rules(APP_CSS).flatMap((rule) => (rule.selector.includes(".dr-page-scroller") ? [rule.selector] : [])))];
      expect(selectors.length).toBeGreaterThan(0);
      for (const selector of selectors) {
        const element = selector.replaceAll(/::[\w-]+|:focus-visible/g, "");
        // From the document: jsdom's element-scoped query drops a :has() chain that the whole document matches.
        const found = [...document.querySelectorAll(element)].filter((match) => root.contains(match));
        expect(found.length, selector).toBeGreaterThan(0);
      }
    } finally {
      walletModal.remove();
    }
  });

  it("holds nothing in its mask but the offset, so what the offset restores reaches the whole page", () => {
    const { root } = renderContainer();
    const mask = root.querySelector(":scope > .simplebar-wrapper > .simplebar-mask");
    expect([...(mask?.children ?? [])].map((child) => child.className)).toEqual(["simplebar-offset"]);
  });

  it("sets its content wrapper's overflow inline, which only an !important rule outranks", () => {
    const { scroller } = renderContainer();
    expect(scroller.current?.style.overflowY).not.toBe("");
  });
});

describe("the page scroller's overrides of the library", () => {
  const painted = [
    { what: "thumb", library: THUMB_CLASS, variable: THUMB_VARIABLE, token: "--klerosUIComponentsPrimaryBlue" },
    { what: "mask", library: MASK_CLASS, variable: MASK_VARIABLE, token: "--klerosUIComponentsWhiteBackground" },
  ] as const;

  for (const { what, library, variable } of painted) {
    it(`the library's ${what} utility paints with the theme's ${variable}`, () => {
      const theirs = libraryRule(library);
      expect(theirs.context).toEqual(["@layer utilities"]);
      expect(declared(theirs.body, "background-color")).toMatch(new RegExp(String.raw`^${varOf(variable).source}\s*!important$`));
    });
  }

  for (const { variable, token } of painted) {
    it(`the theme declares ${variable} as the ${token} token on the root, inherited and never registered, so a rule can redefine it for one element`, () => {
      const themeBlock = /@theme(\s+\w+)?\s*\{/.exec(LIBRARY_THEME);
      expect(themeBlock?.[1], "the theme inlines its colours into the utilities").toBeUndefined();
      expect(LIBRARY_THEME).toMatch(new RegExp(String.raw`${escapeRegExp(variable)}\s*:\s*${varOf(token).source}\s*;`));
      const declaring = rules(LIBRARY_CSS).filter((rule) => declared(rule.body, variable) !== undefined);
      expect(declaring.map((rule) => [rule.selector, rule.context])).toEqual([
        [":root", ["@layer theme"]],
        [":host", ["@layer theme"]],
      ]);
      expect(declared(declaring[0]?.body ?? "", variable)).toMatch(new RegExp(String.raw`^${varOf(token).source}$`));
      for (const css of [LIBRARY_THEME, LIBRARY_CSS, APP_CSS]) expect(css).not.toMatch(new RegExp(String.raw`@property\s+${escapeRegExp(variable)}\b`));
    });
  }

  const thumbStates = [
    { what: "the thumb at rest", app: ".dr-page-scroller > .simplebar-track .simplebar-scrollbar::before", token: "--dr-scroll-thumb" },
    { what: "the thumb under the pointer", app: ".dr-page-scroller > .simplebar-track .simplebar-scrollbar.simplebar-hover::before", token: "--dr-scroll-thumb-hover" },
    {
      what: "the dragged thumb",
      app: ".dr-page-scroller.simplebar-dragging > .simplebar-track.simplebar-vertical .simplebar-scrollbar::before",
      token: "--dr-scroll-thumb-active",
    },
  ] as const;

  for (const { what, app, token } of thumbStates) {
    it(`${what} sets ${THUMB_VARIABLE} to ${token} without !important, in the utilities layer`, () => {
      const ours = appRuleDeclaring(app, THUMB_VARIABLE);
      expect(ours.context).toEqual(["@layer utilities"]);
      expect(declared(ours.body, THUMB_VARIABLE)).toBe(`var(${token})`);
      expect(ours.body).not.toContain("!important");
    });
  }

  it(`the mask sets ${MASK_VARIABLE} to transparent, and its offset restores the library token for the page inside`, () => {
    const mask = appRuleDeclaring(".dr-page-scroller > .simplebar-wrapper > .simplebar-mask", MASK_VARIABLE);
    const offset = appRuleDeclaring(".dr-page-scroller > .simplebar-wrapper > .simplebar-mask > .simplebar-offset", MASK_VARIABLE);
    for (const rule of [mask, offset]) {
      expect(rule.context).toEqual(["@layer utilities"]);
      expect(rule.body).not.toContain("!important");
    }
    expect(declared(mask.body, MASK_VARIABLE)).toBe("transparent");
    expect(declared(offset.body, MASK_VARIABLE)).toBe("var(--klerosUIComponentsWhiteBackground)");
  });

  it("the drag colour wins over the hover colour while both classes are set", () => {
    const hover = appRule(".dr-page-scroller > .simplebar-track .simplebar-scrollbar.simplebar-hover::before");
    const drag = appRule(".dr-page-scroller.simplebar-dragging > .simplebar-track.simplebar-vertical .simplebar-scrollbar::before");
    expect(outranks(specificity(drag.selector), specificity(hover.selector))).toBe(true);
  });

  it("the 10 px track wins over SimpleBar's unlayered 11 px one: unlayered too and one class more specific", () => {
    const theirs = rules(SIMPLEBAR_CSS).find((rule) => rule.selector === ".simplebar-track.simplebar-vertical" && rule.body.includes("width"));
    const ours = appRule(".dr-page-scroller > .simplebar-track.simplebar-vertical");
    expect(theirs?.context).toEqual([]);
    expect(theirs?.body).toContain("width:11px");
    expect(ours.context).toEqual([]);
    expect(ours.body).toMatch(/width:\s*10px/);
    expect(outranks(specificity(ours.selector), specificity(theirs?.selector ?? ""))).toBe(true);
  });

  it("printed, the content wrapper lays out as its content alone, so no overflow applies to it, SimpleBar's inline one or the wallet modal's lock, and no print rule needs !important", () => {
    const printed = rules(APP_CSS).filter((rule) => rule.context.includes("@media print"));
    const wrapper = printed.find((rule) => rule.selector === CONTENT_WRAPPER && declared(rule.body, "display") !== undefined);
    expect(declared(wrapper?.body ?? "", "display")).toBe("contents");
    expect(printed.filter((rule) => rule.body.includes("!important")).map((rule) => rule.selector)).toEqual([]);
  });

  it("SimpleBar insets the thumb 2 px inside the track on each side and rounds it, which leaves a 6 px pill in the 10 px track", () => {
    const sides = rules(SIMPLEBAR_CSS).find((rule) => rule.selector === ".simplebar-scrollbar:before");
    const ends = rules(SIMPLEBAR_CSS).find((rule) => rule.selector === ".simplebar-track.simplebar-vertical .simplebar-scrollbar:before");
    expect(sides?.body).toContain("left:2px");
    expect(sides?.body).toContain("right:2px");
    expect(sides?.body).toContain("border-radius:7px");
    expect(ends?.body).toContain("top:2px");
    expect(ends?.body).toContain("bottom:2px");
  });
});

/** The source of one method of AppKit's modal element, up to the next method. */
function modalMethod(name: string): string {
  const start = APPKIT_MODAL.indexOf(`    ${name}() {`);
  if (start < 0) throw new Error(`AppKit's modal has no ${name} method`);
  const end = APPKIT_MODAL.indexOf("\n    }\n", start);
  return APPKIT_MODAL.slice(start, end);
}

const WALLET_MODAL_LOCK = `:root:has(> body > w3m-modal.open) ${CONTENT_WRAPPER}`;

describe("Reown AppKit's wallet modal, as the page scroller follows it", () => {
  it("is a w3m-modal element AppKit puts at the end of the body", () => {
    expect(APPKIT_CLIENT).toContain("document.createElement('w3m-modal')");
    expect(APPKIT_CLIENT).toContain("document.body.insertAdjacentElement('beforeend', modal)");
  });

  it("carries the open class exactly while it is open", () => {
    expect(modalMethod("onOpen")).toContain("this.classList.add('open')");
    expect(modalMethod("onClose")).toContain("this.classList.remove('open')");
  });

  it("locks scrolling on the body only, which stops a scrolling document but not the page scroller", () => {
    expect(modalMethod("onOpen")).toContain("this.onScrollLock()");
    const lock = modalMethod("onScrollLock");
    expect(lock).toMatch(/body \{[^}]*overflow: hidden;/);
    expect(lock).not.toMatch(/(?:html|:root)\s*\{/);
  });

  it("while it is open the page scroller stops scrolling for the visitor, over SimpleBar's inline overflow", () => {
    const rule = appRule(WALLET_MODAL_LOCK);
    expect(rule.body).toMatch(/overflow:\s*hidden\s*!important/);
  });
});
