import { Steps } from "@kleros/ui-components-library";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { TIMELINE_H, TIMELINE_V } from "./DisputeTimeline";

/** What one selector of a class string must find inside the list. */
interface Expectation {
  readonly count: number;
  readonly texts?: readonly string[];
  readonly every?: (match: Element) => boolean;
}

const ITEMS = [
  { title: "Evidence", subitems: ["Concluded"] },
  { title: "Voting", subitems: ["Ends in ", "02d 05h 19m"] },
  { title: "Appeal", subitems: ["02d 06h 00m"] },
  { title: "Execution" },
];

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

function stepOf(element: Element): Element | null {
  return element.closest("li");
}

function upcoming(element: Element): boolean {
  return stepOf(element)?.getAttribute("aria-disabled") === "true";
}

function current(element: Element): boolean {
  return stepOf(element)?.getAttribute("aria-current") === "step";
}

function concluded(element: Element): boolean {
  const step = stepOf(element);
  return step !== null && !step.hasAttribute("aria-current") && !step.hasAttribute("aria-disabled");
}

function outsideLastStep(element: Element): boolean {
  const list = element.closest("ol");
  const last = list === null ? undefined : Array.from(list.querySelectorAll("li")).at(-1);
  return last?.contains(element) !== true;
}

function isTextBlock(element: Element): boolean {
  return element.firstElementChild?.tagName.toLowerCase() === "h2" && !element.hasAttribute("aria-hidden");
}

function isNumberedBullet(element: Element): boolean {
  return element.tagName.toLowerCase() === "div" && element.querySelector(":scope > span") !== null;
}

function classesOf(element: Element | null | undefined): string[] {
  return (element?.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function sorted(classes: string): string[] {
  return classes.split(" ").sort((a, b) => a.localeCompare(b));
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
        ["li[aria-disabled] [aria-hidden]>div:first-child", { count: 2, every: (match) => upcoming(match) && isNumberedBullet(match) }],
        ["li[aria-disabled] [aria-hidden] span", { count: 2, texts: ["3", "4"] }],
        ["li[aria-current] [aria-hidden]>div:first-child", { count: 1, every: (match) => current(match) && isNumberedBullet(match) }],
        ["li", { count: 4 }],
        ["li>div:last-child", { count: 4, every: isTextBlock }],
        ["li>div:last-child>div", { count: 3, texts: ["Concluded", "Ends in 02d 05h 19m", "02d 06h 00m"] }],
        ["[aria-hidden]>*+*", { count: 3, every: outsideLastStep }],
        ["li[aria-current] [aria-hidden]>*+*", { count: 1, every: current }],
        ["li[aria-disabled] [aria-hidden]>*+*", { count: 1, every: (match) => upcoming(match) && outsideLastStep(match) }],
        ["li:not([aria-current]):not([aria-disabled]) [aria-hidden]>*+*", { count: 1, every: concluded }],
        ["[aria-hidden]>*", { count: 7 }],
        ["[aria-hidden] span", { count: 3, texts: ["2", "3", "4"] }],
        ["h2", { count: 4 }],
      ]),
    );
    const bullet = steps(list)[0]?.querySelector("[aria-hidden]");
    expect(bullet?.firstElementChild?.tagName.toLowerCase()).toBe("svg");
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
        ["li[aria-disabled] [aria-hidden]>div:first-child", { count: 2, every: (match) => upcoming(match) && isNumberedBullet(match) }],
        ["li[aria-disabled] [aria-hidden] span", { count: 2, texts: ["3", "4"] }],
        ["li[aria-current] [aria-hidden]>div:first-child", { count: 1, every: (match) => current(match) && isNumberedBullet(match) }],
        [">li>div:last-child", { count: 4, every: isTextBlock }],
        [">li:not(:last-child)", { count: 3, every: (match) => match.nextElementSibling?.tagName.toLowerCase() === "li" }],
        [">li[aria-current]", { count: 1, texts: ["2VotingEnds in 02d 05h 19m"] }],
        [">li[aria-disabled]", { count: 2, texts: ["3Appeal02d 06h 00m", "4Execution"] }],
        [">li:not([aria-current]):not([aria-disabled])", { count: 1, texts: ["EvidenceConcluded"] }],
        ["[aria-hidden]>*", { count: 4 }],
        ["[aria-hidden] span", { count: 3, texts: ["2", "3", "4"] }],
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
    expect(list.querySelectorAll("li[aria-current] [aria-hidden] > div:first-child > span")).toHaveLength(1);
  });
});

/**
 * The library classes the timeline's overrides beat or build on, pinned whole: a release that changes any of them fails
 * here, before the page, and the timeline's browser spec says whether the overrides still hold.
 */
describe("the library internals the timeline's overrides rely on", () => {
  it("each horizontal step is its bullet, then its text, with the connector as the step's ::after", () => {
    installOfflineAppKitEnvironment();
    const list = renderSteps(TIMELINE_H, true);
    const all = steps(list);
    for (const step of all) {
      expect(Array.from(step.children, (child) => child.tagName.toLowerCase())).toEqual(["div", "div"]);
      expect(step.firstElementChild).toHaveAttribute("aria-hidden", "true");
      expect(classesOf(step.firstElementChild)).toEqual(sorted("flex h-full flex-col items-center justify-start"));
    }
    const base = "relative flex h-fit items-start justify-center lg:!pb-0";
    const connector = "grow after:mx-4 after:my-3 after:h-0 after:w-auto after:grow after:border-t";
    expect(all.map(classesOf)).toEqual([
      sorted(`${base} ${connector} after:border-t-klerosUIComponentsPrimaryBlue`),
      sorted(`${base} ${connector} after:border-t-klerosUIComponentsStroke`),
      sorted(`${base} ${connector} after:border-t-klerosUIComponentsStroke`),
      sorted(`${base} grow-0`),
    ]);
    expect(classesOf(list)).toEqual(expect.arrayContaining(["box-border", "flex", "items-start", "justify-center"]));
  });

  it("the horizontal text sits beside its bullet from lg and centred under it below, its name and states as siblings", () => {
    installOfflineAppKitEnvironment();
    const list = renderSteps(TIMELINE_H, true);
    for (const text of Array.from(list.querySelectorAll(":scope > li > div:last-child"))) {
      expect(classesOf(text)).toEqual(
        sorted(
          "lg:static lg:top-auto lg:left-auto lg:ml-2 lg:flex lg:translate-x-0 lg:flex-col lg:items-start absolute top-6 left-0 ml-0 translate-x-[calc(-50%+12px)] items-center text-center",
        ),
      );
      expect(Array.from(text.children, (child) => child.tagName.toLowerCase())).toEqual(["h2", ...Array.from(text.querySelectorAll("small"), () => "small")]);
      expect(classesOf(text.querySelector("h2"))).toEqual(expect.arrayContaining(["text-sm", "font-semibold", "md:leading-6"]));
    }
  });

  it("each vertical step is a fitted row: its bullet column, then its name over a column of states", () => {
    const list = renderSteps(TIMELINE_V, false);
    const all = steps(list);
    expect(all.map(classesOf)).toEqual([
      sorted("flex w-fit grow basis-0"),
      sorted("flex w-fit grow basis-0"),
      sorted("flex w-fit grow basis-0"),
      sorted("flex w-fit grow-0 basis-auto"),
    ]);
    for (const step of all) {
      expect(Array.from(step.children, (child) => child.tagName.toLowerCase())).toEqual(["div", "div"]);
      const text = step.lastElementChild;
      expect(classesOf(text)).toEqual(sorted("mt-0.5 ml-4"));
      const states = text?.querySelector(":scope > div");
      if (states !== null && states !== undefined) {
        expect(classesOf(states)).toEqual(sorted("flex flex-col"));
        expect(Array.from(states.children, (child) => child.tagName.toLowerCase()).every((tag) => tag === "small")).toBe(true);
      }
    }
  });

  it("the vertical connector is a 1 px left border between the bullets, 8 px from each", () => {
    const list = renderSteps(TIMELINE_V, false);
    const lines = Array.from(list.querySelectorAll("[aria-hidden] > * + *"));
    expect(lines.map(classesOf)).toEqual([
      sorted("my-2 h-auto w-0 grow border-l border-l-klerosUIComponentsPrimaryBlue"),
      sorted("my-2 h-auto w-0 grow border-l border-l-klerosUIComponentsStroke"),
      sorted("my-2 h-auto w-0 grow border-l border-l-klerosUIComponentsStroke"),
    ]);
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("the numbered bullets are 24 px circles and the states 12 px text the timeline resizes (%s)", (_orientation, horizontal) => {
    installOfflineAppKitEnvironment();
    const list = renderSteps(horizontal ? TIMELINE_H : TIMELINE_V, horizontal);
    const bullets = Array.from(list.querySelectorAll("li [aria-hidden] > :first-child"));
    expect(bullets.map(classesOf)).toEqual([
      sorted("fill-klerosUIComponentsPrimaryBlue size-6 basis-auto"),
      sorted("size-6 basis-auto rounded-xl border flex items-center justify-center bg-klerosUIComponentsPrimaryBlue border-klerosUIComponentsPrimaryBlue"),
      sorted("size-6 basis-auto rounded-xl border flex items-center justify-center border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground"),
      sorted("size-6 basis-auto rounded-xl border flex items-center justify-center border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground"),
    ]);
    for (const state of Array.from(list.querySelectorAll("small"))) {
      expect(classesOf(state)).toEqual(sorted("text-klerosUIComponentsSecondaryText text-xs font-normal break-words"));
    }
  });
});
