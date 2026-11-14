import { REGISTRY, buildAppealPanel, describeAppealRules, type AppealPanel, type RulingAmount, type RulingOptions } from "@dispute-resolver/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { testChain, testFamily } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { CrowdfundingPanel } from "./CrowdfundingPanel";
import type { AppealActions } from "./useAppealActions";

const ETH = 10n ** 18n;
const UINT: RulingOptions = { type: "uint", precision: 0 };
const ACTIONS: AppealActions = { pageChainId: 1, context: null, refresh: () => Promise.resolve() };

/** `count` answers coded from 2, the first holding the most. */
function contributions(count: number): RulingAmount[] {
  return Array.from({ length: count }, (_, index) => ({ ruling: BigInt(index + 2), amount: BigInt(count - index) * (ETH / 100n) }));
}

/** A uint question in its appeal period: 2 ETH for the current ruling 1, 3 ETH for any other answer. */
function crowdfunding(round: readonly RulingAmount[]): Extract<AppealPanel, { readonly kind: "crowdfunding" }> {
  const family = testFamily();
  const panel = buildAppealPanel({
    family,
    period: 3,
    rules: describeAppealRules(REGISTRY, family),
    override: undefined,
    rulingOptions: UINT,
    fallbackOutcomes: null,
    numberOfChoices: maxUint256,
    currentRuling: { ok: true, value: 1n },
    appealInfo: { ok: true, value: { appealCost: ETH, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } },
    multipliers: { ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } },
    funding: { ok: true, value: { round: 0n, contributions: round, fundedRulings: [] } },
    withdraw: null,
  });
  if (panel.kind !== "crowdfunding") throw new Error(`expected crowdfunding, got ${panel.kind}`);
  return panel;
}

function renderPanel(round: readonly RulingAmount[]): HTMLElement {
  return renderWithProviders(<CrowdfundingPanel panel={crowdfunding(round)} actions={ACTIONS} chain={testChain(1)} />).container;
}

function fundingCards(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Rulings to fund" }))
    .getAllByRole("listitem")
    .filter((item) => within(item).getByRole("heading", { level: 4 }).textContent !== "Fund a new answer");
}

describe("CrowdfundingPanel", () => {
  it("counts the answers that hold contributions without a card in one line under the cards", () => {
    renderPanel(contributions(25));
    expect(fundingCards()).toHaveLength(1 + 1 + 20);
    const line = screen.getByText("5 more answers hold contributions.");
    const list = screen.getByRole("list", { name: "Rulings to fund" });
    expect(list.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says a single answer left without a card in the singular", () => {
    renderPanel(contributions(21));
    expect(screen.getByText("1 more answer holds contributions.")).toBeInTheDocument();
  });

  it("shows no count line when every answer that holds contributions has a card", () => {
    const container = renderPanel(contributions(20));
    expect(fundingCards()).toHaveLength(1 + 1 + 20);
    expect(container).not.toHaveTextContent(/more answers? holds? contributions/);
  });

  it("an answer without a card typed into the free input shows what it already holds", async () => {
    const user = userEvent.setup();
    renderPanel(contributions(25));
    const freeInput = screen.getByRole("listitem", { name: "Fund a new answer" });
    expect(fundingCards().map((item) => within(item).getByRole("heading", { level: 4 }).textContent)).not.toContain("25");
    await user.type(within(freeInput).getByRole("textbox", { name: /^Answer/ }), "25");
    expect(freeInput).toHaveTextContent(/Remaining\s*2\.99 ETH\s*of\s*3 ETH/);
  });
});
