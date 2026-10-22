import { Steps } from "@kleros/ui-components-library";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { TIMELINE_H, TIMELINE_V } from "./DisputeTimeline";

/** What one selector of a class string must find inside the list. */
interface Expectation {
  readonly count: number;
  /** The text of every match, in order. */
  readonly texts?: readonly string[];
  /** Holds for every match. */
  readonly every?: (match: Element) => boolean;
}

const ITEMS = [
  { title: "Evidence", subitems: ["Concluded"] },
  { title: "Voting", subitems: ["Ends in ", "02d 05h 19m"] },
  { title: "Appeal", subitems: ["Lasts 02d 06h 00m"] },
  { title: "Execution" },
];

/** The index of the bracket closing the one that opens `token`. */
function closingBracket(token: string): number {
  let depth = 0;
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] === "[") depth += 1;
    if (token[index] === "]") depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error(`Unbalanced variant in ${token}`);
}

/**
 * The selector of every arbitrary descendant variant (`[&_…]:utility`) in a class string, as the CSS Tailwind emits for it
 * reads: underscores become spaces, the brackets may nest.
 */
function variantSelectors(className: string): Set<string> {
  const tokens = className.split(/\s+/).filter((token) => token.startsWith("[&"));
  return new Set(tokens.map((token) => token.slice(2, closingBracket(token)).replaceAll("_", " ").trim()));
}

/** Runs every selector of `className` inside `list` against its expectation; a selector without one fails, and so does a stale one. */
function expectSelectors(className: string, list: HTMLElement, expectations: ReadonlyMap<string, Expectation>): void {
  const selectors = variantSelectors(className);
  for (const selector of selectors) {
    const expectation = expectations.get(selector);
    if (expectation === undefined) throw new Error(`No expectation for selector ${selector}`);
    const matches = Array.from(list.querySelectorAll(`:scope ${selector}`));
    const { count, texts, every } = expectation;
    expect(matches, selector).toHaveLength(count);
    if (texts !== undefined) {
      const found = matches.map((match) => match.textContent);
      expect(found, selector).toEqual(texts);
    }
    if (every !== undefined) {
      const failing = matches.filter((match) => !every(match));
      expect(failing, selector).toEqual([]);
    }
  }
  expect([...expectations.keys()].sort((a, b) => a.localeCompare(b))).toEqual([...selectors].sort((a, b) => a.localeCompare(b)));
}

function steps(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll("li"));
}

function upcoming(element: Element): boolean {
  return element.closest("li")?.getAttribute("aria-disabled") === "true";
}

function outsideLastStep(element: Element): boolean {
  const list = element.closest("ol");
  const last = list === null ? undefined : Array.from(list.querySelectorAll("li")).at(-1);
  return last?.contains(element) !== true;
}

function renderSteps(className: string, horizontal: boolean, items = ITEMS, currentItemIndex = 1): HTMLElement {
  render(<Steps items={items} currentItemIndex={currentItemIndex} horizontal={horizontal} className={className} />);
  return screen.getByRole("list", { name: horizontal ? "Horizontal progress steps" : "Vertical progress steps" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the library steps under the timeline's class strings", () => {
  it("the vertical steps still render the structure the timeline's selectors rely on", () => {
    const list = renderSteps(TIMELINE_V, false);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expectSelectors(
      TIMELINE_V,
      list,
      new Map<string, Expectation>([
        ["small", { count: 4 }],
        ["li[aria-current] small+small", { count: 1, texts: ["02d 05h 19m"] }],
        ["li[aria-current] h2", { count: 1, texts: ["Voting"] }],
        ["li[aria-disabled] [aria-hidden]>div:first-child", { count: 2, every: upcoming }],
        ["li[aria-disabled] [aria-hidden] span", { count: 2, texts: ["3", "4"] }],
        ["[aria-hidden] span", { count: 3, texts: ["2", "3", "4"] }],
        ["[aria-hidden]>*+*", { count: 3, every: outsideLastStep }],
        ["div>li>div:last-child", { count: 3, every: (match) => match.querySelector("h2") !== null && outsideLastStep(match) }],
        ["[aria-hidden]>*", { count: 7 }],
        ["h2", { count: 4 }],
      ]),
    );
    const concluded = steps(list)[0]?.querySelector("[aria-hidden]");
    expect(concluded?.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  it("the horizontal steps still render the structure the timeline's selectors rely on", () => {
    installOfflineAppKitEnvironment();
    const list = renderSteps(TIMELINE_H, true);
    expect(list.querySelectorAll(":scope > li")).toHaveLength(4);
    expectSelectors(
      TIMELINE_H,
      list,
      new Map<string, Expectation>([
        ["small", { count: 4 }],
        ["li[aria-current] small+small", { count: 1, texts: ["02d 05h 19m"] }],
        ["li[aria-disabled] [aria-hidden]>div:first-child", { count: 2, every: upcoming }],
        ["li[aria-disabled] [aria-hidden] span", { count: 2, texts: ["3", "4"] }],
        ["[aria-hidden] span", { count: 3, texts: ["2", "3", "4"] }],
        ["[aria-hidden]>*", { count: 4 }],
        ["li", { count: 4 }],
        ["h2", { count: 4 }],
      ]),
    );
    expect(list.className).not.toContain("w-62.5");
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("every step carries the attribute values the selectors assume (%s)", (_orientation, horizontal) => {
    installOfflineAppKitEnvironment();
    const list = renderSteps(horizontal ? TIMELINE_H : TIMELINE_V, horizontal);
    const all = steps(list);
    expect(all.map((step) => step.getAttribute("aria-current"))).toEqual([null, "step", null, null]);
    expect(all.map((step) => step.getAttribute("aria-disabled"))).toEqual([null, null, "true", "true"]);
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("the execution step as the current step has no state text (%s)", (_orientation, horizontal) => {
    installOfflineAppKitEnvironment();
    const items = [
      { title: "Evidence", subitems: ["Concluded"] },
      { title: "Voting", subitems: ["Concluded"] },
      { title: "Appeal", subitems: ["Concluded"] },
      { title: "Execution" },
    ];
    const list = renderSteps(horizontal ? TIMELINE_H : TIMELINE_V, horizontal, items, 3);
    expect(list.querySelectorAll("li[aria-current]")).toHaveLength(1);
    expect(list.querySelectorAll("li[aria-current] small")).toHaveLength(0);
  });
});
