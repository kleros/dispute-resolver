import type { BrowserContext } from "@playwright/test";

// The report-only run of checklist C2 (ARCHITECTURE.md §10.2): while the golden cases run, every violation of the app's
// `Content-Security-Policy-Report-Only` policy on the new app is collected from the browser's `securitypolicyviolation`
// events and written to the report. A violation is recorded as its directive and the blocked resource's origin only: a
// blocked RPC request carries its key in the path, so no path or query is ever kept. Nothing here is blocking; the run
// log decides when the header can be enforced.

/** One report-only violation of the new app's policy, with no URL path or query. */
export interface CspViolation {
  /** The directive the resource was checked against (`connect-src`, `style-src-elem`, …). */
  readonly directive: string;
  /** The blocked resource: an origin, a scheme (`data:`, `blob:`) or a keyword (`inline`, `eval`). */
  readonly blocked: string;
  /** How many violation events the browser reported for this pair on the screen (Chromium reports a blocked fetch twice). */
  readonly count: number;
}

/** What a page reports for one violation, and the URL of the frame that reported it, before it is reduced. */
export interface RawCspViolation {
  readonly disposition: string;
  readonly effectiveDirective: string;
  readonly blockedURI: string;
  readonly frameUrl: string;
}

const BINDING = "__goldenRecordCspViolation";
const ORIGIN_SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);
const KEYWORD = /^[a-z][a-z-]*$/;

function originOf(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  return ORIGIN_SCHEMES.has(parsed.protocol) ? parsed.origin : null;
}

/** The blocked resource with nothing but its origin, its scheme or the browser's keyword. */
export function blockedResourceOf(blockedURI: string): string {
  const origin = originOf(blockedURI);
  if (origin !== null) return origin;
  if (KEYWORD.test(blockedURI)) return blockedURI;
  return URL.canParse(blockedURI) ? new URL(blockedURI).protocol : "unparseable";
}

/**
 * The violation as the report writes it, or `null` when it is not one of the new app's report-only policy: an enforced
 * policy (the runner's, C3) and a frame of another origin (a third-party evidence display) are left out.
 */
export function reportOnlyViolationOf(raw: RawCspViolation, appOrigin: string): Omit<CspViolation, "count"> | null {
  if (raw.disposition !== "report" || originOf(raw.frameUrl) !== appOrigin) return null;
  return { directive: raw.effectiveDirective, blocked: blockedResourceOf(raw.blockedURI) };
}

/** The violations collected so far, one entry per directive and blocked resource, sorted. */
export function summarizeViolations(violations: readonly Omit<CspViolation, "count">[]): CspViolation[] {
  const counts = new Map<string, CspViolation>();
  for (const { directive, blocked } of violations) {
    const key = `${directive} ${blocked}`;
    const previous = counts.get(key);
    counts.set(key, { directive, blocked, count: (previous?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => a.directive.localeCompare(b.directive) || a.blocked.localeCompare(b.blocked));
}

/** A page's payload as a violation, or `null` when it is not the shape `forwardViolations` sends. */
function rawViolationOf(payload: unknown, frameUrl: string): RawCspViolation | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { disposition, effectiveDirective, blockedURI } = payload as Record<string, unknown>;
  if (typeof disposition !== "string" || typeof effectiveDirective !== "string" || typeof blockedURI !== "string") return null;
  return { disposition, effectiveDirective, blockedURI, frameUrl };
}

/** Runs in every frame before any app script: forwards each violation event to the test through the binding. */
function forwardViolations(binding: string): void {
  document.addEventListener("securitypolicyviolation", (event) => {
    const record = (globalThis as unknown as Record<string, ((raw: Omit<RawCspViolation, "frameUrl">) => void) | undefined>)[binding];
    record?.({ disposition: event.disposition, effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
  });
}

export interface CspCapture {
  /** The report-only violations of `appOrigin` the context's pages hit so far. */
  violations(): CspViolation[];
}

/** Collects the report-only violations of the new app's documents in every page of `context`, across navigations. */
export async function captureCspViolations(context: BrowserContext, appOrigin: string): Promise<CspCapture> {
  const collected: Omit<CspViolation, "count">[] = [];
  // The frame is the one Playwright saw call the binding, so a third-party frame cannot pass itself off as the app.
  await context.exposeBinding(BINDING, ({ frame }, payload: unknown) => {
    const raw = rawViolationOf(payload, frame.url());
    const violation = raw === null ? null : reportOnlyViolationOf(raw, appOrigin);
    if (violation !== null) collected.push(violation);
  });
  await context.addInitScript(forwardViolations, BINDING);
  return { violations: () => summarizeViolations(collected) };
}
