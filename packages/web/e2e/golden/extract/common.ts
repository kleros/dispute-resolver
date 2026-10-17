import type { Locator, Page } from "@playwright/test";
import { redactUrl, redactUrlsIn } from "../redact";
import type { EvidenceDisplayRendering, EvidenceDisplaySnapshot } from "../types";

// Helpers both extractors share. They run in Node and read the page through Playwright locators; text is read with
// `textContent`, which includes collapsed accordion bodies.

/** Collapses runs of whitespace and trims; the comparison removes whitespace entirely where 04 §1 says so. */
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The collapsed text of the first match, or `null` when nothing matches. */
export async function textOf(locator: Locator): Promise<string | null> {
  if ((await locator.count()) === 0) return null;
  const text = await locator.first().textContent();
  return text === null ? null : collapse(text);
}

/** An attribute of the first match, or `null` when nothing matches or the attribute is absent. */
export async function attributeOf(locator: Locator, name: string): Promise<string | null> {
  if ((await locator.count()) === 0) return null;
  return locator.first().getAttribute(name);
}

export function integerOrNull(value: string | null): number | null {
  if (value === null || !/^-?\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** `Wed, 11 Jan 2023 13:02:47 GMT` (both apps' evidence times) in Unix seconds. */
export function utcStringToSeconds(text: string | null): number | null {
  if (text === null) return null;
  const millis = Date.parse(text);
  return Number.isNaN(millis) ? null : Math.floor(millis / 1000);
}

/** A `DDd HHh MMm` countdown in seconds, or `null` when the text is not one. */
export function countdownSeconds(text: string | null): number | null {
  const match = text === null ? null : /(\d{1,5})d (\d{1,2})h (\d{1,2})m/.exec(text);
  if (match === null) return null;
  const [days, hours, minutes] = match.slice(1).map(Number) as [number, number, number];
  return ((days * 24 + hours) * 60 + minutes) * 60;
}

const WEI_DECIMALS = 18;

/** A decimal ether amount (`0.273`, `1e-7` excluded) as wei in decimal, or `null` when it is not a plain decimal. */
export function etherToWei(text: string | null): string | null {
  const match = text === null ? null : /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (match === null) return null;
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").slice(0, WEI_DECIMALS).padEnd(WEI_DECIMALS, "0");
  return (BigInt(whole) * 10n ** BigInt(WEI_DECIMALS) + BigInt(fraction)).toString();
}

const RPC_PARAMETER = /rpc/i;

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value.toString();
  return JSON.stringify(value);
}

/**
 * The display parameters: `_v: "0"` sends one URI-encoded JSON object as the query, later versions a search string. An
 * RPC parameter is written as its host and a fingerprint of the whole URL (D-35), and any URL inside another parameter
 * the same way, so no API key reaches a snapshot while equal values still compare equal.
 */
export function displayParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const raw = query.startsWith("?") ? query.slice(1) : query;
  let entries: [string, unknown][];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    entries = typeof parsed === "object" && parsed !== null ? Object.entries(parsed) : [];
  } catch {
    entries = [...new URLSearchParams(raw).entries()];
  }
  for (const [key, value] of entries) {
    const text = stringValue(value);
    params[key] = RPC_PARAMETER.test(key) ? redactUrl(text) : redactUrlsIn(text);
  }
  return params;
}

/** How long a display may take to render its item: it reads the chain through the RPC its parameters name. */
const DISPLAY_RENDER_MS = 30_000;
const DISPLAY_POLL_MS = 2_000;
/** The rendered text kept in a snapshot: enough to show which item rendered. */
const DISPLAY_TEXT_LIMIT = 300;

/** A frame document's URL as origin and path; its query carries the display parameters (RPC URLs), so it is dropped. */
export function documentUrlOf(raw: string): string | null {
  if (raw === "" || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol === "http:" || url.protocol === "https:") return `${url.origin}${url.pathname}`;
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/** What the display frame shows once its text stops changing, or after `DISPLAY_RENDER_MS`. */
async function renderingOf(frame: Locator): Promise<EvidenceDisplayRendering> {
  const content = await (await frame.first().elementHandle()).contentFrame();
  if (content === null) return { documentUrl: null, text: "" };
  const readText = async () =>
    content
      .locator("body")
      .innerText({ timeout: DISPLAY_POLL_MS })
      .catch(() => "");
  await waitUntilStable(
    frame.page(),
    async () => {
      const text = await readText();
      return text.trim() === "" ? null : text;
    },
    DISPLAY_RENDER_MS,
    DISPLAY_POLL_MS,
  );
  return { documentUrl: documentUrlOf(content.url()), text: redactUrlsIn(collapse(await readText())).slice(0, DISPLAY_TEXT_LIMIT) };
}

/**
 * The evidence-display iframe: origin, path, parameters (URLs redacted to host and fingerprint), sandbox tokens, and
 * what the frame rendered.
 */
export async function evidenceDisplayOf(frame: Locator, pageUrl: string): Promise<EvidenceDisplaySnapshot | null> {
  const src = await attributeOf(frame, "src");
  if (src === null) return null;
  const sandbox = (await attributeOf(frame, "sandbox")) ?? "";
  const url = new URL(src, pageUrl);
  return {
    present: true,
    srcOrigin: url.origin,
    srcPath: url.pathname,
    params: displayParams(url.search),
    sandbox: sandbox
      .split(/\s+/)
      .filter((token) => token !== "")
      .sort((a, b) => a.localeCompare(b)),
    rendered: await renderingOf(frame),
  };
}

/** Polls `fingerprint` until it returns the same non-null value twice in a row `intervalMs` apart, or the budget ends. */
export async function waitUntilStable(page: Page, fingerprint: () => Promise<string | null>, budgetMs: number, intervalMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  let previous: string | null = null;
  while (Date.now() < deadline) {
    const current = await fingerprint();
    if (current !== null && current === previous) return true;
    previous = current;
    await page.waitForTimeout(intervalMs);
  }
  return false;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * The URL a snapshot records for the page it loaded: the app's origin and the screen path (`1/cases/1454`). The
 * extractors navigate with the full URL built from `PROD_URL` or `NEW_URL`, whose credentials (a password-protected
 * deploy preview), path or query could carry a key, so only the base URL's origin is recorded.
 */
export function recordedPageUrl(base: string, screenPath: string): string {
  return `${new URL(base).origin}/${screenPath}`;
}
