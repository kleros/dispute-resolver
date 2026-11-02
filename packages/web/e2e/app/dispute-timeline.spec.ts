import { expect, test, type Page } from "@playwright/test";
import { encodeFunctionResult, parseAbi, toFunctionSelector, type Hex } from "viem";
import { GENERAL_COURT, MAINNET_ARBITRATOR, caseDetailsAnswers, disputeStruct, isDisputesCall, type Court } from "../support/arbitrator";
import { appOriginOf, callData, callTarget, fakeNetwork, type HttpAnswer, type RpcAnswer, type RpcCall } from "../support/network";
import { PAGE_SCROLLER } from "../support/pageScroll";
import { switchScheme } from "../support/theme";

// "Unknown" never comes from the chain (a uint256 period gives a finite deadline), and these disputes have no appeal to read
// for the losing side's line, so only the unit tests cover the two.

const DISPUTE_ID = 4242n;
const CASE_PATH = `/1/cases/${DISPUTE_ID.toString()}`;
const ARBITRABLE: Hex = "0x00000000000000000000000000000000000a4242";
const HEIGHT = 900;
const DAY = 86_400n;
const HOUR = 3_600n;
const MINUTE = 60n;

const POLICY_ABI = parseAbi(["function policies(uint256) view returns (string)"]);
const POLICIES_SELECTOR = toFunctionSelector(POLICY_ABI[0]);
const MAINNET_POLICY_REGISTRY = "0xcf1f07713d5193fae5c1653c9f61953d048bece4";

const LG = 900;
const FIVE_STEPS = 1080;
const FOUR_WIDTHS = [375, 899, LG, 1280] as const;
const FIVE_WIDTHS = [375, 1079, FIVE_STEPS, 1280] as const;

/**
 * The narrowest space accepted between two neighbouring labels: twice the 8 px a connector keeps from each bullet. Closer
 * than that, two states start to read as one run of text.
 */
const MIN_LABEL_GAP = 16;
/** Sub-pixel rounding of centred text and borders. */
const TOLERANCE = 1;
const CONNECTOR_GAP = 8;
/** The narrowest phone the app lays out for. */
const NARROWEST = 320;
const COUNTDOWN = /^\d{2,3}d \d{2}h \d{2}m$/;

interface Scenario {
  readonly period: number;
  readonly court: Court;
  /** How long ago the current period began. */
  readonly elapsed: bigint;
  /** Whether the page runs on Playwright's clock, so a spec can move time on. */
  readonly clock?: boolean;
}

/** Three-digit day counts in every state, the widest the countdown and the durations get. */
const LONG_COURT: Court = { hiddenVotes: false, timesPerPeriod: [150n * DAY, 0n, 123n * DAY + 4n * HOUR + 5n * MINUTE, 456n * DAY + 7n * HOUR + 8n * MINUTE] };
const LONG_HIDDEN_COURT: Court = {
  hiddenVotes: true,
  timesPerPeriod: [150n * DAY, 222n * DAY + 22n * HOUR, 333n * DAY + 3n * HOUR + 3n * MINUTE, 444n * DAY + 4n * HOUR + 4n * MINUTE],
};

/** No logs and no code at the arbitrable, and a locator that knows no meta-evidence: those sections settle at once as absent. */
const EMPTY_CHAIN: Readonly<Record<string, RpcAnswer>> = { eth_blockNumber: { result: "0x1312d00" }, eth_getLogs: { result: [] }, eth_getCode: { result: "0x" } };
const NO_META_EVIDENCE: HttpAnswer = { json: {} };

function noPolicy(call: RpcCall): RpcAnswer | undefined {
  if (callTarget(call) !== MAINNET_POLICY_REGISTRY || callData(call)?.startsWith(POLICIES_SELECTOR) !== true) return undefined;
  return { result: encodeFunctionResult({ abi: POLICY_ABI, functionName: "policies", result: "" }) };
}

async function openCase(page: Page, baseURL: string | undefined, scenario: Scenario): Promise<void> {
  const lastPeriodChange = BigInt(Math.floor(Date.now() / 1_000)) - scenario.elapsed;
  const details = caseDetailsAnswers(MAINNET_ARBITRATOR, DISPUTE_ID, { court: scenario.court });
  const rpc = (call: RpcCall): RpcAnswer | undefined => {
    if (isDisputesCall(call, MAINNET_ARBITRATOR, DISPUTE_ID)) return disputeStruct({ arbitrated: ARBITRABLE, period: scenario.period, lastPeriodChange });
    return noPolicy(call) ?? details(call) ?? EMPTY_CHAIN[call.method];
  };
  await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), rpc, http: (request) => (request.kind === "locator" ? NO_META_EVIDENCE : undefined) });
  // Colours are compared once settled: the steps ease between colours over the tab timing otherwise.
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: HEIGHT });
  if (scenario.clock === true) await page.clock.install();
  await page.goto(CASE_PATH);
  await expect(timelineList(page), "the timeline never rendered (needs the chain-1 read RPC in the build)").toBeVisible({ timeout: 30_000 });
}

function timeline(page: Page) {
  return page.getByRole("region", { name: "Dispute timeline" });
}

function timelineList(page: Page) {
  return timeline(page).getByRole("list");
}

/** The page lays out again a frame after a resize, so the list is measured once its box holds still for three frames. */
async function settled(page: Page): Promise<void> {
  const still = await timelineList(page).evaluate(async (list) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    let last = "";
    let unchanged = 0;
    for (let frames = 0; unchanged < 3 && frames < 120; frames += 1) {
      await frame();
      const box = list.getBoundingClientRect();
      const now = `${String(box.left)} ${String(box.right)} ${String(box.top)} ${String(box.bottom)}`;
      unchanged = now === last ? unchanged + 1 : 0;
      last = now;
    }
    return unchanged >= 3;
  });
  expect(still, "the timeline kept moving for two seconds").toBe(true);
}

async function resizeTo(page: Page, width: number, orientation: "Horizontal" | "Vertical"): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
  await expect(timelineList(page)).toHaveAccessibleName(`${orientation} progress steps`);
  await settled(page);
}

interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

type StepState = "concluded" | "current" | "upcoming";

interface State {
  readonly text: string;
  readonly rect: Rect;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly figures: string;
}

interface Edge {
  readonly width: string;
  readonly color: string;
}

/** What the browser reports of one step; the connector is read from it on this side. */
interface RawStep {
  readonly name: string;
  readonly current: string | null;
  readonly disabled: string | null;
  readonly step: Rect;
  readonly column: Rect;
  readonly bullet: Rect;
  readonly ring: string;
  readonly halo: string;
  readonly background: string;
  readonly nameText: Rect;
  readonly states: readonly State[];
  readonly label: Rect;
  /** The lines of text the step's name and states take. */
  readonly lines: number;
  /** The step's `::after`, the row's connector. */
  readonly after: {
    readonly content: string;
    readonly width: string;
    readonly marginLeft: string;
    readonly marginRight: string;
    readonly marginTop: string;
    /** Its top border, then its bottom one. */
    readonly edges: readonly [Edge, Edge];
  };
  /** The element under the bullet, the list's connector: its left border, then its right one. */
  readonly line: { readonly rect: Rect; readonly edges: readonly [Edge, Edge] } | null;
}

interface Connector {
  readonly start: number;
  readonly end: number;
  /** Where the row's `::after` box ends with its right margin: the next step's left edge when the connector fills its step. */
  readonly reach: number;
  readonly middle: number;
  readonly thickness: number;
  readonly color: string;
}

interface Step extends RawStep {
  readonly state: StepState;
  readonly connector: Connector | null;
}

interface Geometry {
  readonly horizontal: boolean;
  readonly list: Rect;
  readonly band: Rect;
  readonly blue: string;
  readonly edge: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly steps: readonly Step[];
}

function stateOf(raw: RawStep): StepState {
  if (raw.current === "step") return "current";
  return raw.disabled === "true" ? "upcoming" : "concluded";
}

function isTransparent(color: string): boolean {
  return color === "transparent" || /(,\s*0\)|\/\s*0\))$/.test(color);
}

/**
 * The line two borders draw side by side: a transparent border keeps its room but is not seen, so the line is the visible
 * borders, its offset the width of a hidden first border. Both visible ones must share a colour to read as one line.
 */
function visibleLine(edges: readonly [Edge, Edge]): { readonly offset: number; readonly thickness: number; readonly color: string } | null {
  const [first, second] = edges.map((edge) => {
    const width = Number.parseFloat(edge.width);
    return { width, color: edge.color, visible: width > 0 && !isTransparent(edge.color) };
  });
  const visible = [first, second].filter((edge) => edge?.visible === true);
  if (first === undefined || visible.length === 0) return null;
  return {
    offset: first.visible ? 0 : first.width,
    thickness: visible.reduce((sum, edge) => sum + (edge?.width ?? 0), 0),
    color: [...new Set(visible.map((edge) => edge?.color))].join(" | "),
  };
}

function rowConnector(raw: RawStep): Connector | null {
  const line = visibleLine(raw.after.edges);
  if (raw.after.content === "none" || line === null) return null;
  const start = raw.column.right + Number.parseFloat(raw.after.marginLeft);
  const end = start + Number.parseFloat(raw.after.width);
  const middle = raw.step.top + Number.parseFloat(raw.after.marginTop) + line.offset + line.thickness / 2;
  return { start, end, reach: end + Number.parseFloat(raw.after.marginRight), middle, thickness: line.thickness, color: line.color };
}

function listConnector(raw: RawStep): Connector | null {
  const line = raw.line === null ? null : visibleLine(raw.line.edges);
  if (raw.line === null || line === null) return null;
  const { rect } = raw.line;
  return { start: rect.top, end: rect.bottom, reach: rect.bottom, middle: rect.left + line.offset + line.thickness / 2, thickness: line.thickness, color: line.color };
}

/** Every measure the assertions read, taken in one pass so no re-render lands between two of them. */
async function measure(page: Page): Promise<Geometry> {
  const raw = await timelineList(page).evaluate((list, scrollerSelector) => {
    const rectOf = (box: DOMRect): Rect => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
    const contentsOf = (node: Node): Range => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range;
    };
    const lineCount = (node: Node): number => {
      const middles = Array.from(contentsOf(node).getClientRects())
        .filter((box) => box.width > 0)
        .map((box) => (box.top + box.bottom) / 2)
        .sort((a, b) => a - b);
      return middles.filter((middle, index) => index === 0 || middle - (middles[index - 1] ?? middle) > 8).length;
    };
    const wrapper = list.closest("section")?.parentElement;
    if (wrapper === null || wrapper === undefined) throw new Error("The timeline has no wrapper.");
    const steps = Array.from(list.querySelectorAll("li"), (item): RawStep => {
      const column = item.querySelector(":scope > [aria-hidden]");
      const bullet = column?.firstElementChild;
      const text = item.querySelector(":scope > div:last-child");
      const name = text?.querySelector("h2");
      if (!column || !bullet || !text || !name) throw new Error("A step lost its bullet or its text.");
      const after = getComputedStyle(item, "::after");
      const line = column.children[1];
      const bulletStyle = getComputedStyle(bullet);
      return {
        name: item.getAttribute("aria-label") ?? "",
        current: item.getAttribute("aria-current"),
        disabled: item.getAttribute("aria-disabled"),
        step: rectOf(item.getBoundingClientRect()),
        column: rectOf(column.getBoundingClientRect()),
        bullet: rectOf(bullet.getBoundingClientRect()),
        ring: bulletStyle.borderTopColor,
        halo: bulletStyle.boxShadow,
        background: [item, text].map((element) => getComputedStyle(element).backgroundColor).join(" "),
        nameText: rectOf(contentsOf(name).getBoundingClientRect()),
        states: Array.from(text.querySelectorAll("small"), (small) => {
          const style = getComputedStyle(small);
          return {
            text: small.textContent,
            rect: rectOf(small.getBoundingClientRect()),
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            figures: style.fontVariantNumeric,
          };
        }),
        label: rectOf(text.getBoundingClientRect()),
        lines: lineCount(text),
        after: {
          content: after.content,
          width: after.width,
          marginLeft: after.marginLeft,
          marginRight: after.marginRight,
          marginTop: after.marginTop,
          edges: [
            { width: after.borderTopWidth, color: after.borderTopColor },
            { width: after.borderBottomWidth, color: after.borderBottomColor },
          ],
        },
        line:
          line === undefined
            ? null
            : {
                rect: rectOf(line.getBoundingClientRect()),
                edges: [
                  { width: getComputedStyle(line).borderLeftWidth, color: getComputedStyle(line).borderLeftColor },
                  { width: getComputedStyle(line).borderRightWidth, color: getComputedStyle(line).borderRightColor },
                ],
              },
      };
    });
    const currentBullet = list.querySelector("li[aria-current] [aria-hidden] > :first-child");
    const pageScroller = document.querySelector(scrollerSelector) ?? document.documentElement;
    return {
      horizontal: list.getAttribute("aria-label") === "Horizontal progress steps",
      list: rectOf(list.getBoundingClientRect()),
      band: rectOf(wrapper.getBoundingClientRect()),
      blue: currentBullet === null ? "" : getComputedStyle(currentBullet).backgroundColor,
      edge: getComputedStyle(wrapper).borderTopColor,
      scrollWidth: pageScroller.scrollWidth,
      clientWidth: pageScroller.clientWidth,
      steps,
    };
  }, PAGE_SCROLLER);
  const connectorOf = raw.horizontal ? rowConnector : listConnector;
  return { ...raw, steps: raw.steps.map((step) => ({ ...step, state: stateOf(step), connector: connectorOf(step) })) };
}

function middle(rect: Rect): number {
  return (rect.left + rect.right) / 2;
}

function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    right: Math.max(...rects.map((rect) => rect.right)),
    top: Math.min(...rects.map((rect) => rect.top)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function stateText(step: Step): Rect | null {
  return union(step.states.map((state) => state.rect));
}

function textExtent(step: Step): Rect {
  return union([step.nameText, ...step.states.map((state) => state.rect)]) ?? step.nameText;
}

/** The current step's state is its value alone, set in the value style: 16 px semibold in tabular figures. */
function expectCurrentValue(step: Step, where: string, value: RegExp = COUNTDOWN): void {
  if (step.state !== "current" || step.states.length === 0) return;
  const texts = step.states.map((state) => state.text);
  expect.soft(texts, `${where}: the value alone`).toEqual([expect.stringMatching(value)]);
  for (const state of step.states) {
    expect.soft([state.fontSize, state.fontWeight, state.figures], `${where}: the value style`).toEqual(["16px", "600", "tabular-nums"]);
  }
}

function expectConnector(geometry: Geometry, step: Step, next: Step | undefined, at: string): void {
  const { connector } = step;
  if (next === undefined) {
    expect.soft(connector, `${at}: the last step has no connector`).toBeNull();
    return;
  }
  expect.soft(connector, `${at}: a connector runs to ${next.name}`).not.toBeNull();
  if (connector === null) return;
  const along = geometry.horizontal
    ? { after: step.bullet.right, before: next.bullet.left, middle: (step.bullet.top + step.bullet.bottom) / 2 }
    : { after: step.bullet.bottom, before: next.bullet.top, middle: middle(step.bullet) };
  expect.soft(Math.abs(connector.start - along.after - CONNECTOR_GAP), `${at}: the connector starts 8 px from the bullet`).toBeLessThanOrEqual(TOLERANCE);
  expect.soft(Math.abs(along.before - connector.end - CONNECTOR_GAP), `${at}: the connector stops 8 px from ${next.name}'s bullet`).toBeLessThanOrEqual(TOLERANCE);
  expect.soft(Math.abs(connector.middle - along.middle), `${at}: the connector runs through the bullets' middle`).toBeLessThanOrEqual(TOLERANCE);
  if (geometry.horizontal) expect.soft(Math.abs(connector.reach - next.step.left), `${at}: the connector fills its step`).toBeLessThanOrEqual(TOLERANCE);
  const style = step.state === "concluded" ? { thickness: 2, color: geometry.blue } : { thickness: 1, color: geometry.edge };
  expect.soft(connector.thickness, `${at}: the connector's thickness`).toBe(style.thickness);
  expect.soft(connector.color, `${at}: the connector's colour`).toBe(style.color);
}

function expectBullets(geometry: Geometry, where: string): void {
  for (const step of geometry.steps) {
    const at = `${where}, ${step.name}`;
    if (step.state === "current") {
      expect.soft(step.halo, `${at}: the current bullet has a 4 px halo at 22 % of its blue`).toMatch(/(\/ 0\.22\)|, 0\.22\)) 0px 0px 0px 4px$/);
    } else {
      expect.soft(step.halo, `${at}: only the current bullet has a halo`).toBe("none");
    }
    if (step.state === "upcoming") expect.soft(step.ring, `${at}: the upcoming ring is the band's edge`).toBe(geometry.edge);
  }
  expect.soft(geometry.scrollWidth, `${where}: the page does not scroll sideways`).toBeLessThanOrEqual(geometry.clientWidth);
}

function expectRowLabel(geometry: Geometry, step: Step, at: string): void {
  const bulletMiddle = middle(step.bullet);
  const state = stateText(step);
  expect.soft(Math.abs(middle(step.nameText) - bulletMiddle), `${at}: the name is centred under the bullet`).toBeLessThanOrEqual(TOLERANCE);
  if (state !== null) expect.soft(Math.abs(middle(state) - bulletMiddle), `${at}: the state is centred under the bullet`).toBeLessThanOrEqual(TOLERANCE);
  expect.soft(step.lines, `${at}: at most a name and a state line`).toBeLessThanOrEqual(state === null ? 1 : 2);
  expect.soft(step.nameText.top, `${at}: the name sits below the bullet`).toBeGreaterThanOrEqual(step.bullet.bottom);
  expect.soft(step.label.bottom, `${at}: the list holds the label`).toBeLessThanOrEqual(geometry.list.bottom + TOLERANCE);
}

function expectRow(geometry: Geometry, where: string): void {
  const { steps } = geometry;
  const first = steps[0];
  const last = steps.at(-1);
  if (first === undefined || last === undefined) throw new Error(`${where}: no steps.`);
  const insets = [first.bullet.left - geometry.list.left, geometry.list.right - last.bullet.right];
  expect.soft(Math.abs((insets[0] ?? 0) - (insets[1] ?? 0)), `${where}: the rail is centred`).toBeLessThanOrEqual(TOLERANCE);
  steps.forEach((step, index) => {
    const at = `${where}, ${step.name}`;
    const next = steps[index + 1];
    expectRowLabel(geometry, step, at);
    expectCurrentValue(step, at);
    expectConnector(geometry, step, next, at);
    if (next !== undefined) {
      const gap = textExtent(next).left - textExtent(step).right;
      expect.soft(gap, `${at}: at least ${String(MIN_LABEL_GAP)} px between its label and ${next.name}'s`).toBeGreaterThanOrEqual(MIN_LABEL_GAP);
    }
  });
  expect.soft(textExtent(first).left, `${where}: the first label stays inside the band`).toBeGreaterThanOrEqual(geometry.band.left);
  expect.soft(textExtent(last).right, `${where}: the last label stays inside the band`).toBeLessThanOrEqual(geometry.band.right);
  expectBullets(geometry, where);
}

function expectListRow(geometry: Geometry, step: Step, at: string): void {
  expect.soft(step.background, `${at}: no plate behind the row`).toBe("rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)");
  expect.soft(step.nameText.left, `${at}: the name follows the bullet`).toBeGreaterThan(step.bullet.right);
  expect.soft(step.lines, `${at}: one row`).toBe(1);
  const state = stateText(step);
  if (state === null) return;
  expect.soft(Math.abs(state.bottom - step.nameText.bottom), `${at}: the state is on the name's row`).toBeLessThanOrEqual(2);
  expect.soft(Math.abs(state.right - geometry.list.right), `${at}: the state is right-aligned`).toBeLessThanOrEqual(TOLERANCE);
  expect.soft(state.left - step.nameText.right, `${at}: the state keeps clear of the name`).toBeGreaterThanOrEqual(12 - TOLERANCE);
}

function expectList(geometry: Geometry, where: string): void {
  const { steps } = geometry;
  expect.soft(Math.abs(geometry.list.left - geometry.band.left), `${where}: the list starts at the band's edge`).toBeLessThanOrEqual(TOLERANCE);
  expect.soft(Math.abs(geometry.list.right - geometry.band.right), `${where}: the list spans the band's width`).toBeLessThanOrEqual(TOLERANCE);
  steps.forEach((step, index) => {
    const at = `${where}, ${step.name}`;
    expectListRow(geometry, step, at);
    expectCurrentValue(step, at);
    expectConnector(geometry, step, steps[index + 1], at);
  });
  expectBullets(geometry, where);
}

function expectNarrowestList(geometry: Geometry, where: string): void {
  const { steps } = geometry;
  steps.forEach((step, index) => {
    const at = `${where}, ${step.name}`;
    expectCurrentValue(step, at);
    expectConnector(geometry, step, steps[index + 1], at);
    const state = stateText(step);
    if (state === null) return;
    expect.soft(Math.abs(state.right - geometry.list.right), `${at}: the state is right-aligned`).toBeLessThanOrEqual(TOLERANCE);
    expect.soft(state.left, `${at}: the state stays inside the list`).toBeGreaterThanOrEqual(geometry.list.left);
    const beside = state.left - step.nameText.right >= 12 - TOLERANCE;
    const below = state.top >= step.nameText.bottom - TOLERANCE;
    expect.soft(beside || below, `${at}: the state keeps clear of the name`).toBe(true);
  });
  expectBullets(geometry, where);
}

async function expectEveryWidth(page: Page, widths: readonly number[], rowFrom: number): Promise<void> {
  for (const colorScheme of ["light", "dark"] as const) {
    await switchScheme(page, colorScheme);
    for (const width of widths) {
      const row = width >= rowFrom;
      await resizeTo(page, width, row ? "Horizontal" : "Vertical");
      const where = `${colorScheme}, ${String(width)} px`;
      const geometry = await measure(page);
      if (row) expectRow(geometry, where);
      else expectList(geometry, where);
      await expect.soft(timeline(page).getByRole("list"), `${where}: one list of steps`).toHaveCount(1);
      const values = timeline(page).locator("li[aria-current] small");
      await expect.soft(values, `${where}: one countdown`).toHaveCount(geometry.steps.some((step) => step.state === "current" && step.states.length > 0) ? 1 : 0);
    }
  }
}

test.describe("the dispute timeline's geometry", () => {
  test("four periods in voting: a centred row from 900 px, a list of rows below", async ({ page, baseURL }) => {
    await openCase(page, baseURL, { period: 2, court: GENERAL_COURT, elapsed: HOUR });
    await expect(timelineList(page).getByRole("listitem")).toHaveText(["EvidenceConcluded", /^2Voting05d 00h [23]\dm$/, "3Appeal03d 09h 00m", "4Execution"]);
    await expectEveryWidth(page, FOUR_WIDTHS, LG);
  });

  test("four periods in evidence with three-digit day counts: the first label stays inside the band", async ({ page, baseURL }) => {
    await openCase(page, baseURL, { period: 0, court: LONG_COURT, elapsed: HOUR });
    await expect(timelineList(page).getByRole("listitem", { name: "Evidence" })).toContainText(/149d 2\dh \d{2}m$/);
    await expect(timelineList(page).getByRole("listitem", { name: "Appeal" })).toContainText(/456d 07h 08m$/);
    await expectEveryWidth(page, FOUR_WIDTHS, LG);
  });

  test("five periods of a hidden-vote court in commit with three-digit day counts: a row from 1080 px only", async ({ page, baseURL }) => {
    await openCase(page, baseURL, { period: 1, court: LONG_HIDDEN_COURT, elapsed: HOUR });
    await expect(timelineList(page).getByRole("listitem")).toHaveCount(5);
    await expect(timelineList(page).getByRole("listitem", { name: "Commit" })).toContainText(/222d 2\dh \d{2}m$/);
    await expectEveryWidth(page, FIVE_WIDTHS, FIVE_STEPS);
  });

  test("five periods of a hidden-vote court in evidence with three-digit day counts: the first label stays inside the band", async ({ page, baseURL }) => {
    await openCase(page, baseURL, { period: 0, court: LONG_HIDDEN_COURT, elapsed: HOUR });
    await expect(timelineList(page).getByRole("listitem", { name: "Evidence" })).toContainText(/149d 2\dh \d{2}m$/);
    await expectEveryWidth(page, FIVE_WIDTHS, FIVE_STEPS);
  });

  test("execution: the current numbered step with no state line, every connector before it done", async ({ page, baseURL }) => {
    await openCase(page, baseURL, { period: 4, court: GENERAL_COURT, elapsed: HOUR });
    const execution = timelineList(page).getByRole("listitem", { name: "Execution" });
    await expect(execution).toHaveAttribute("aria-current", "step");
    await expect(execution).toHaveText("4Execution");
    await expect(execution.locator("small")).toHaveCount(0);
    await expectEveryWidth(page, FOUR_WIDTHS, LG);
  });

  const narrowest: readonly (readonly [string, Scenario])[] = [
    ["four periods in evidence", { period: 0, court: LONG_COURT, elapsed: HOUR }],
    ["five periods of a hidden-vote court in commit", { period: 1, court: LONG_HIDDEN_COURT, elapsed: HOUR }],
  ];
  for (const [what, scenario] of narrowest) {
    test(`${what} with three-digit day counts at ${String(NARROWEST)} px: every state whole, right-aligned and clear of its name`, async ({ page, baseURL }) => {
      await openCase(page, baseURL, scenario);
      for (const colorScheme of ["light", "dark"] as const) {
        await switchScheme(page, colorScheme);
        await resizeTo(page, NARROWEST, "Vertical");
        expectNarrowestList(await measure(page), `${colorScheme}, ${String(NARROWEST)} px`);
      }
    });
  }

  test("the countdown holds its place and its value style as a minute passes and when it turns Ended", async ({ page, baseURL }) => {
    const closing: Court = { hiddenVotes: false, timesPerPeriod: [DAY, 0n, HOUR + 5n * MINUTE, DAY] };
    await openCase(page, baseURL, { period: 2, court: closing, elapsed: HOUR, clock: true });
    const widths = [375, 1280];
    /** The voting step's value and name, relative to its step. */
    const voting = async (width: number) => {
      await resizeTo(page, width, width >= LG ? "Horizontal" : "Vertical");
      const step = (await measure(page)).steps.find((candidate) => candidate.name === "Voting");
      const value = step?.states[0];
      if (step === undefined || value === undefined) throw new Error(`${String(width)} px: the voting step has no value.`);
      const from = (rect: Rect) => ({ left: rect.left - step.step.left, right: rect.right - step.step.left, top: rect.top - step.step.top, bottom: rect.bottom - step.step.top });
      return { step, value: from(value.rect), name: from(step.nameText) };
    };
    const before = new Map<number, Awaited<ReturnType<typeof voting>>>();
    for (const width of widths) before.set(width, await voting(width));
    const later: readonly (readonly [number, RegExp])[] = [
      [60_000, COUNTDOWN],
      [6 * 60_000, /^Ended$/],
    ];
    for (const [time, text] of later) {
      await page.clock.runFor(time);
      for (const width of widths) {
        const where = `${String(width)} px, after ${String(time / 60_000)} min`;
        const was = before.get(width);
        if (was === undefined) throw new Error(`${where}: nothing measured before.`);
        const now = await voting(width);
        expectCurrentValue(now.step, where, text);
        expect.soft(now.name, `${where}: the name holds still`).toEqual(was.name);
        expect.soft(now.value.top, `${where}: the value's top`).toBeCloseTo(was.value.top, 1);
        expect.soft(now.value.bottom, `${where}: the value's bottom`).toBeCloseTo(was.value.bottom, 1);
        const kept = width >= LG ? middle(now.value) - middle(was.value) : now.value.right - was.value.right;
        expect.soft(kept, `${where}: the value keeps its ${width >= LG ? "centre" : "right edge"}`).toBeCloseTo(0, 1);
      }
    }
  });

  test("the halo eases in with the steps' colours, and holds still under reduced motion", async ({ page, baseURL }) => {
    await openCase(page, baseURL, { period: 2, court: GENERAL_COURT, elapsed: HOUR });
    const bullet = timelineList(page).locator("li[aria-current] [aria-hidden] > :first-child");
    const transition = () => bullet.evaluate((element) => ({ property: getComputedStyle(element).transitionProperty, duration: getComputedStyle(element).transitionDuration }));
    for (const width of [375, 1280]) {
      await resizeTo(page, width, width >= LG ? "Horizontal" : "Vertical");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const easing = await transition();
      expect.soft(easing.property.split(", "), `${String(width)} px`).toContain("box-shadow");
      expect.soft(easing.duration, `${String(width)} px`).toBe("0.25s");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect.soft((await transition()).property, `${String(width)} px, reduced motion`).toBe("none");
    }
  });
});
