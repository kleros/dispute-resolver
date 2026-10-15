import type { Locator, Page } from "@playwright/test";

// Production renders a few snapshot values only partially or not at all: the arbitrable and `lastPeriodChange` are read
// but never shown, evidence submitters are truncated to `0x1234...abcd`, and appeal cards do not print their ruling code.
// The old app is a React 17 class tree, so those values are read from the rendered components' own state and props (the
// `__reactFiber$` link React puts on every DOM node). Everything production does render is read from the DOM instead.

export interface ProductionEvidenceRecord {
  readonly submittedBy: string;
  readonly submittedAt: number;
}

export interface ProductionCaseState {
  /** Whether the case container (`Interact`) was found. */
  readonly found: boolean;
  readonly loading: boolean;
  readonly arbitrated: string | null;
  readonly lastPeriodChange: number | null;
  readonly evidences: readonly ProductionEvidenceRecord[];
}

/** The `Interact` container's state, found by walking up from its `<main>`. */
export async function readProductionCaseState(page: Page): Promise<ProductionCaseState> {
  return page.evaluate(() => {
    const empty = { found: false, loading: true, arbitrated: null, lastPeriodChange: null, evidences: [] };
    const main = document.querySelector('main[class*="interact_interact__"]');
    if (main === null) return empty;
    const fiberKey = Object.keys(main).find((key) => key.startsWith("__reactFiber$"));
    if (fiberKey === undefined) return empty;
    interface Fiber {
      readonly return: Fiber | null;
      readonly stateNode: { readonly state?: Record<string, unknown> } | null;
    }
    let fiber = (main as unknown as Record<string, Fiber | undefined>)[fiberKey] ?? null;
    while (fiber !== null && !(fiber.stateNode?.state !== undefined && "arbitrated" in fiber.stateNode.state)) fiber = fiber.return;
    const state = fiber?.stateNode?.state;
    if (state === undefined) return empty;
    const dispute = state.arbitratorDispute as Record<string | number, unknown> | null | undefined;
    const lastPeriodChange = dispute?.lastPeriodChange ?? dispute?.[4];
    const evidences = Array.isArray(state.evidences) ? (state.evidences as Record<string, unknown>[]) : [];
    return {
      found: true,
      loading: state.loading === true,
      arbitrated: typeof state.arbitrated === "string" && state.arbitrated !== "" ? state.arbitrated : null,
      lastPeriodChange: typeof lastPeriodChange === "bigint" || typeof lastPeriodChange === "number" ? Number(lastPeriodChange) : null,
      evidences: evidences.map((evidence) => ({ submittedBy: String(evidence.submittedBy), submittedAt: Number(evidence.submittedAt) })),
    };
  });
}

/** The ruling code each crowdfunding card was rendered with (`CrowdfundingCard` props), `null` for the free-input card. */
export async function readProductionCardCodes(cards: Locator): Promise<(string | null)[]> {
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
      interface Fiber {
        readonly return: Fiber | null;
        readonly memoizedProps: Record<string, unknown> | null;
      }
      let fiber = fiberKey === undefined ? null : ((element as unknown as Record<string, Fiber | undefined>)[fiberKey] ?? null);
      while (fiber !== null && !(fiber.memoizedProps !== null && "appealCallback" in fiber.memoizedProps)) fiber = fiber.return;
      const code = fiber?.memoizedProps?.rulingOptionCode;
      if (typeof code === "string" || typeof code === "number" || typeof code === "bigint") return BigInt(code).toString();
      return null;
    }),
  );
}
