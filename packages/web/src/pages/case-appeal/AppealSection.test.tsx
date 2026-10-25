import {
  REFUSED_RULING_TEXT,
  buildAppealPanel,
  combinationCode,
  getChain,
  type AnswerEncodingError,
  type AppealInfo,
  type AppealPanel,
  type AppealPanelInput,
  type ChainConfig,
  type ChainId,
  type FamilyDetection,
  type LocalIdResolution,
  type Multipliers,
  type Outcome,
  type RulingAmount,
  type RulingOptions,
  type WithdrawState,
  type WriteCall,
} from "@dispute-resolver/core";
import { getLocalTimeZone, resetLocalTimeZone, setLocalTimeZone } from "@internationalized/date";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeContract } from "@wagmi/core";
import { useState } from "react";
import { formatEther } from "viem";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { CaseDispute, CaseWriteContext, SectionData } from "../../data";
import { TEST_ARBITRABLE, sectionLoading, sectionReady, sectionUnavailable, testFamily, testFoundLookup, testOkMetaEvidence, testWriteContext } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import {
  TEST_SENT,
  TEST_TX_HASH,
  TEST_WALLET_ADDRESS,
  createConnectedTestWallet,
  createTestWallet,
  fakeWriteController,
  holdChainSwitches,
  type FakeWriteController,
  type TestWallet,
} from "../../test/wallet";
import { AppealSection } from "./AppealSection";
import { ANSWER_ERROR_MESSAGES } from "./answer";
import {
  APPEAL_COST_CHECKING,
  CROWDFUNDING_EXPLANATION,
  ESCROW_ENDED,
  ESCROW_EXPLANATION,
  FEES_UNAVAILABLE_TITLE,
  HANDLED_BY_ARBITRABLE_TITLE,
  WITHDRAW_NOTHING,
  matchedCardLine,
  newAnswerLine,
} from "./copy";

/** `null`: the wallet's real write hooks, whose chain guard runs before anything is signed. Otherwise the fake. */
const writes = vi.hoisted((): { fake: FakeWriteController | null } => ({ fake: null }));

/** The real signing call, watched so a refused write can be shown to send nothing. */
vi.mock("@wagmi/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wagmi/core")>();
  return { ...actual, writeContract: vi.fn(actual.writeContract) };
});

vi.mock("../../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../wallet")>();
  return {
    ...actual,
    useWrite: () => (writes.fake ?? actual).useWrite(),
    useWriteSequence: () => (writes.fake ?? actual).useWriteSequence(),
  };
});

const ETH = 10n ** 18n;
const APPEAL_START = 1_700_000_000;
const APPEAL_END = 4_000_000_000;
const APPEAL_INFO: AppealInfo = { appealCost: ETH, appealPeriodStart: APPEAL_START, appealPeriodEnd: APPEAL_END };
/** Winner side: 2 ETH until the end of the appeal period. Loser side: 3 ETH until half-way through it. */
const MULTIPLIERS: Multipliers = { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n };
const WINNER_TOTAL = 2n * ETH;
const LOSER_TOTAL = 3n * ETH;
const LOCAL_ID: LocalIdResolution = { kind: "local-id", value: 7n };
const YES_NO: RulingOptions = { type: "single-select", titles: ["Yes", "No"] };
const REFUSE = "Invalid / Refused to Arbitrate / Tied";
/** The countdowns at the start of the appeal period: APPEAL_END − APPEAL_START (2,300,000,000 s) to the winner deadline, half of it to the loser deadline. */
const WINNER_TIME_LEFT = "26620d 08h 53m";
const LOSER_TIME_LEFT = "13310d 04h 26m";
/** The cards of the grid that fund an answer the user enters, not a fixed ruling. */
const ENTERED_ANSWER_CARDS: ReadonlySet<string> = new Set(["Fund a new answer", "Fund another combination"]);

const GOVERNOR = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});
const ESCROW = testFamily({
  family: "escrow-v1",
  writeFamily: "escrow-v1",
  capabilities: { localId: "disputeIDtoTransactionID", evidence: { kind: "local-id" }, appeal: { kind: "escrow-pay-cost" }, withdraw: { kind: "none" } },
});

function chainConfig(chainId: ChainId): ChainConfig {
  const chain = getChain(chainId);
  if (chain === undefined) throw new Error(`Chain ${String(chainId)} is not configured.`);
  return chain;
}

interface PanelOptions {
  readonly family?: FamilyDetection;
  readonly rulingOptions?: RulingOptions;
  readonly currentRuling?: bigint;
  /** The arbitrator's `currentRuling` read; `currentRuling` gives a successful one. */
  readonly currentRulingRead?: Outcome<bigint>;
  readonly contributions?: readonly RulingAmount[];
  readonly multipliers?: Multipliers;
}

/** A period-3 panel built by core, as `useCase` assembles it. */
function crowdfunding(options: PanelOptions = {}): AppealPanel {
  const input: AppealPanelInput = {
    family: options.family ?? testFamily(),
    period: 3,
    override: undefined,
    rulingOptions: options.rulingOptions ?? YES_NO,
    fallbackOutcomes: null,
    currentRuling: options.currentRulingRead ?? { ok: true, value: options.currentRuling ?? 1n },
    appealInfo: { ok: true, value: APPEAL_INFO },
    multipliers: { ok: true, value: options.multipliers ?? MULTIPLIERS },
    funding: { ok: true, value: { round: 0n, contributions: options.contributions ?? [], fundedRulings: [] } },
    withdraw: null,
  };
  return buildAppealPanel(input);
}

interface DisputeOptions {
  readonly chainId?: ChainId;
  readonly family?: FamilyDetection;
  readonly localId?: LocalIdResolution;
  readonly write?: SectionData<CaseWriteContext>;
  /** The appeal cost read again before an appeal; by default the cost the panel shows. */
  readonly readAppealCost?: CaseWriteContext["readAppealCost"];
}

function caseDispute(panel: AppealPanel | SectionData<AppealPanel>, options: DisputeOptions = {}): CaseDispute {
  const chainId = options.chainId ?? 1;
  const family = options.family ?? testFamily({ chainId });
  const lookup = testFoundLookup({ chainId, period: 3 });
  const appealPanel = "status" in panel ? panel : sectionReady(panel);
  const shownCost = appealPanel.status === "ready" && appealPanel.value.kind === "escrow-appeal" ? appealPanel.value.appealCost : APPEAL_INFO.appealCost;
  const context = testWriteContext({
    binding: lookup.binding,
    family,
    localId: options.localId ?? LOCAL_ID,
    readAppealCost: options.readAppealCost ?? (() => Promise.resolve({ ok: true, value: shownCost })),
  });
  return {
    status: "dispute",
    chainId,
    disputeId: 1n,
    lookup: sectionReady(lookup),
    view: sectionLoading,
    family: sectionReady(family),
    metaEvidence: sectionReady(testOkMetaEvidence()),
    disputeEvent: sectionLoading,
    evidence: sectionLoading,
    appealDecisions: sectionLoading,
    courts: sectionLoading,
    appealPanel,
    write: options.write ?? sectionReady(context),
  };
}

interface WalletOptions {
  readonly wallet?: TestWallet;
  /** `false` renders without a wallet; by default the wallet is connected first, on its own chain. */
  readonly connected?: boolean;
}

/** An Escrow V1 appeal of 1 ETH on transaction 9. */
function escrowDispute(readAppealCost?: CaseWriteContext["readAppealCost"]): CaseDispute {
  return caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW, localId: { kind: "transaction-id", value: 9n }, readAppealCost });
}

/** Renders the section and returns what it renders into. */
async function renderSection(dispute: CaseDispute, { wallet = createTestWallet(), connected = true }: WalletOptions = {}): Promise<HTMLElement> {
  if (connected) await wallet.connect();
  return renderWithProviders(<AppealSection dispute={dispute} chain={chainConfig(dispute.chainId)} />, { path: `/${String(dispute.chainId)}`, wallet }).container;
}

/** Fixes the clock at the start of the appeal period, so each countdown shows the whole time left to its deadline. */
function freezeClockAtAppealStart(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(APPEAL_START * 1000);
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

function cardTitle(item: HTMLElement): string {
  return within(item).getByRole("heading", { level: 4 }).textContent;
}

/** The fixed cards, in the order they are shown. */
function cardElements(): HTMLElement[] {
  const list = screen.queryByRole("list", { name: "Rulings to fund" });
  if (list === null) return [];
  return within(list)
    .getAllByRole("listitem")
    .filter((item) => !ENTERED_ANSWER_CARDS.has(cardTitle(item)));
}

function cardTitles(): string[] {
  return cardElements().map(cardTitle);
}

function card(title: string): HTMLElement {
  return screen.getByRole("listitem", { name: title });
}

function contributionField(container: HTMLElement): HTMLInputElement {
  return within(container).getByRole<HTMLInputElement>("spinbutton", { name: /Contribution/ });
}

function fundButton(container: HTMLElement): HTMLElement {
  return within(container).getByRole("button", { name: /^Fund/ });
}

/** Every call the fake write hooks were asked to send, in order; a refused build fails the test. */
function sentCalls(fake: FakeWriteController): WriteCall[] {
  return fake.executions.flatMap((execution) =>
    execution.builds.map((build) => {
      if (!build.ok) throw new Error(`A build was refused: ${build.refusal}.`);
      return build.call;
    }),
  );
}

/** Waits until the fake write hooks were asked `executions` times, then returns every call they were asked to send. */
async function sentCallsAfter(executions = 1): Promise<WriteCall[]> {
  await waitFor(() => {
    expect(writes.fake?.executions).toHaveLength(executions);
  });
  if (writes.fake === null) throw new Error("The fake write hooks are not installed.");
  return sentCalls(writes.fake);
}

/** Renders the section over successive reads of its panel; "Next read" moves to the next one, as a refresh would. */
async function renderReads(reads: readonly AppealPanel[]) {
  const wallet = await createConnectedTestWallet();
  function Changing() {
    const [read, setRead] = useState(0);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setRead((current) => current + 1);
          }}
        >
          Next read
        </button>
        <AppealSection dispute={caseDispute(reads[read] ?? crowdfunding())} chain={chainConfig(1)} />
      </>
    );
  }
  return renderWithProviders(<Changing />, { path: "/1", wallet });
}

async function nextRead(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Next read" }));
}

function freeInputCard(): HTMLElement {
  return screen.getByRole("listitem", { name: "Fund a new answer" });
}

/** Types a date (MMDDYYYY) and a time (HHMM) into the free-input card's date field, from its month segment. */
async function typeDateAnswer(user: ReturnType<typeof userEvent.setup>, date: string, time: string): Promise<void> {
  const [month] = within(freeInputCard()).getAllByRole("spinbutton", { name: /month/i });
  if (month === undefined) throw new Error("The date field has no month segment.");
  await user.click(month);
  await user.keyboard(date);
  await user.keyboard(time);
}

/** The escrow panel's live region for the cost check; the write status notice's region carries no `aria-atomic`. */
function costCheckRegion(panel: HTMLElement): HTMLElement {
  const region = panel.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]');
  if (region === null) throw new Error("The escrow panel has no status region for the cost check.");
  return region;
}

/** A card's live regions, in document order. */
function liveRegions(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[aria-live="polite"][aria-atomic="true"]')];
}

function composerCard(): HTMLElement {
  return screen.getByRole("listitem", { name: "Fund another combination" });
}

beforeEach(() => {
  writes.fake = null;
});

describe("AppealSection: section states", () => {
  it("shows a placeholder while the panel loads, without a panel body", async () => {
    const panel = await renderSection(caseDispute(sectionLoading));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(within(panel).queryByRole("heading")).toBeNull();
    expect(within(panel).queryByRole("button")).toBeNull();
    expect(within(panel).queryByRole("list")).toBeNull();
  });

  it("an unavailable panel says why, with a retry", async () => {
    await renderSection(caseDispute(sectionUnavailable("not-found", "This dispute has no meta-evidence, so its ruling options are unknown.")));
    expect(screen.getByText("Appeal unavailable")).toBeInTheDocument();
    expect(screen.getByText("This dispute has no meta-evidence, so its ruling options are unknown.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Appeal" })).toBeInTheDocument();
  });
});

describe("AppealSection: panel kinds", () => {
  /** Each kind with a text only its body shows. */
  const kinds: readonly (readonly [AppealPanel["kind"], AppealPanel, string])[] = [
    ["handled-by-arbitrable", { kind: "handled-by-arbitrable" }, HANDLED_BY_ARBITRABLE_TITLE],
    ["escrow-appeal", { kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, ESCROW_EXPLANATION],
    ["escrow-ended", { kind: "escrow-ended" }, ESCROW_ENDED],
    ["crowdfunding", crowdfunding(), CROWDFUNDING_EXPLANATION],
    ["fees-unavailable", { kind: "fees-unavailable", error: { code: "unsupported", message: "The appeal multipliers could not be read." } }, FEES_UNAVAILABLE_TITLE],
    ["withdraw", { kind: "withdraw", state: { status: "nothing" } }, WITHDRAW_NOTHING],
    ["withdraw-unsupported", { kind: "withdraw-unsupported" }, "Withdrawals unavailable here"],
  ];

  it.each(kinds)("the %s panel shows its own body and no other kind's", async (_kind, appealPanel, shown) => {
    const panel = await renderSection(caseDispute(appealPanel));
    expect(panel).toHaveTextContent(shown);
    for (const [, , other] of kinds) {
      if (other !== shown) expect(panel).not.toHaveTextContent(other);
    }
  });

  it("the hidden panel renders nothing to read", async () => {
    const panel = await renderSection(caseDispute({ kind: "hidden" }));
    expect(panel.textContent).toBe("");
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("a family with no funding interface says appeals are handled in the arbitrable application and offers no action that sends value", async () => {
    const panel = await renderSection(caseDispute({ kind: "handled-by-arbitrable" }));
    expect(panel).toHaveTextContent(/handled in the arbitrable application/);
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(cardElements()).toHaveLength(0);
  });

  it("idr-legacy in execution says withdrawals are not supported through the resolver", async () => {
    const panel = await renderSection(caseDispute({ kind: "withdraw-unsupported" }));
    expect(panel).toHaveTextContent(/Withdrawals are not supported through the Dispute Resolver for this contract/);
    expect(panel).not.toHaveTextContent(/\d ETH/);
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("fees that cannot be calculated show the notice with the reason, and no cards", async () => {
    const panel = await renderSection(caseDispute({ kind: "fees-unavailable", error: { code: "rpc-error", message: "The RPC did not answer." } }));
    expect(panel).toHaveTextContent("Appeal fees could not be calculated");
    expect(panel).toHaveTextContent("The RPC did not answer.");
    expect(cardElements()).toHaveLength(0);
  });

  it.each(["rpc-error", "reverted", "not-found"] as const)("fees that failed with %s offer a retry, since a new read can change them", async (code) => {
    await renderSection(caseDispute({ kind: "fees-unavailable", error: { code, message: "The read failed." } }));
    expect(screen.getByRole("button", { name: "Retry the appeal fees" })).toBeInTheDocument();
  });

  it.each(["unsupported", "invalid-data", "no-rpc"] as const)("fees that failed with %s offer no retry, since a new read cannot change them", async (code) => {
    const panel = await renderSection(caseDispute({ kind: "fees-unavailable", error: { code, message: "The arbitrable does not expose all of its appeal multipliers." } }));
    expect(panel).toHaveTextContent(FEES_UNAVAILABLE_TITLE);
    expect(screen.queryByRole("button", { name: "Retry the appeal fees" })).toBeNull();
  });

  it("a failed current-ruling read names no winner and prices no card, and says why the fees could not be calculated", async () => {
    const failed = { code: "rpc-error", message: "Could not read the current ruling: the RPC did not answer." } as const;
    const panel = await renderSection(caseDispute(crowdfunding({ currentRulingRead: { ok: false, error: failed } })));
    expect(panel).toHaveTextContent(FEES_UNAVAILABLE_TITLE);
    expect(panel).toHaveTextContent(failed.message);
    expect(panel).not.toHaveTextContent("Latest jury decision");
    expect(panel).not.toHaveTextContent(/\d ETH/);
    expect(cardElements()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  it("the appeal-period text never carries the withdraw sentence", async () => {
    const panel = await renderSection(caseDispute(crowdfunding()));
    expect(panel).toHaveTextContent(/fully fund the crowdfunding deposit/);
    expect(panel).not.toHaveTextContent(/You don't have any amount to withdraw/);
    expect(panel).toHaveTextContent(/Rewards only apply if both sides are funded/);
  });

  it("actions name the write context's failure when it could not be read", async () => {
    const panel = await renderSection(caseDispute(crowdfunding(), { write: sectionUnavailable("rpc-error", "The dispute details could not be read.") }));
    expect(panel).toHaveTextContent("The dispute details could not be read.");
    expect(fundButton(card("Yes"))).toBeDisabled();
  });
});

describe("AppealSection: crowdfunding cards", () => {
  it("each card shows its title, funded percent, remaining amount and the countdown to its deadline, in ruling order, and the current ruling's card says it is the latest jury decision", async () => {
    freezeClockAtAppealStart();
    await renderSection(caseDispute(crowdfunding({ contributions: [{ ruling: 1n, amount: ETH / 2n }] })));
    expect(cardTitles()).toEqual([REFUSE, "Yes", "No"]);
    expect(card("Yes")).toHaveTextContent("Latest jury decision");
    expect(card("No")).not.toHaveTextContent("Latest jury decision");
    expect(within(card("Yes")).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(card("Yes")).toHaveTextContent("25.00% Funded");
    expect(card("Yes")).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(contributionField(card("Yes"))).toHaveValue(formatEther(WINNER_TOTAL - ETH / 2n));
    expect(within(card("Yes")).getByText(WINNER_TIME_LEFT)).toBeInTheDocument();
    expect(card("No")).toHaveTextContent("Remaining 3 ETH of 3 ETH");
    expect(contributionField(card("No"))).toHaveValue(formatEther(LOSER_TOTAL));
    expect(within(card("No")).getByText(LOSER_TIME_LEFT)).toBeInTheDocument();
  });

  it("a fixed card and the free-input card each show the remaining amount and total of what they fund", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, contributions: [{ ruling: 1n, amount: ETH / 2n }] })));
    expect(card("0")).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(freeInputCard()).toHaveTextContent("Remaining 3 ETH of 3 ETH");
  });

  it("an answer typed into the free input that equals the current ruling shows and prefills that card's remaining amount, its total, funded percent and deadline", async () => {
    freezeClockAtAppealStart();
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 3n, contributions: [{ ruling: 3n, amount: ETH / 2n }] })));
    expect(within(freeInputCard()).getByText(LOSER_TIME_LEFT)).toBeInTheDocument();
    await user.type(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), "2");
    const entered = freeInputCard();
    expect(entered).toHaveTextContent("This answer has its own card, “2”: its funding is shown here.");
    expect(entered).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(contributionField(entered)).toHaveValue("1.5");
    expect(within(entered).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(within(entered).getByText(WINNER_TIME_LEFT)).toBeInTheDocument();
    expect(fundButton(entered)).toBeEnabled();
  });

  it("the free-input card has its live region before any answer is typed, and funds the new answer by name", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 } })));
    const [region] = liveRegions(freeInputCard());
    expect(region).toHaveTextContent(newAnswerLine("answer"));
    expect(screen.getByRole("button", { name: "Fund the new answer" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Contribution (ETH) for the new answer" })).toBeInTheDocument();
  });

  it("typing an answer that has its own card announces that card and its amounts, and Fund names it; clearing the answer announces a new answer again", async () => {
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 3n, contributions: [{ ruling: 6n, amount: ETH }] })));
    const [region] = liveRegions(freeInputCard());
    const field = within(freeInputCard()).getByRole("textbox", { name: /Answer/ });
    await user.type(field, "5");
    expect(liveRegions(freeInputCard())).toEqual([region]);
    expect(region).toHaveTextContent(`${matchedCardLine("5")} 2 ETH remaining of 3 ETH.`);
    expect(region).not.toHaveTextContent(newAnswerLine("answer"));
    expect(within(freeInputCard()).getByRole("button", { name: "Fund 5" })).toBeInTheDocument();
    expect(within(freeInputCard()).getByRole("spinbutton", { name: "Contribution (ETH) for 5" })).toBeInTheDocument();

    await user.clear(field);
    expect(liveRegions(freeInputCard())).toEqual([region]);
    expect(region).toHaveTextContent(newAnswerLine("answer"));
    expect(region).not.toHaveTextContent("has its own card");
    expect(within(freeInputCard()).getByRole("button", { name: "Fund the new answer" })).toBeInTheDocument();
  });

  it("an answer that equals a contributed value funds that value's remaining amount until its loser deadline", async () => {
    freezeClockAtAppealStart();
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 3n, contributions: [{ ruling: 6n, amount: ETH }] })));
    await user.type(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), "5");
    const entered = freeInputCard();
    expect(entered).toHaveTextContent("This answer has its own card, “5”: its funding is shown here.");
    expect(entered).toHaveTextContent("Remaining 2 ETH of 3 ETH");
    expect(within(entered).getByText(LOSER_TIME_LEFT)).toBeInTheDocument();
    await user.click(fundButton(entered));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, 6n], value: 2n * ETH }]);
  });

  it("a fully funded uint current ruling shows 0 and disables its contribution and Fund, on its card and on the free input when its answer is typed", async () => {
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 3n, contributions: [{ ruling: 3n, amount: WINNER_TOTAL }] })));
    expect(card("2")).toHaveTextContent("Remaining 0 ETH of 2 ETH");
    expect(contributionField(card("2"))).toHaveValue("0");
    expect(contributionField(card("2"))).toBeDisabled();
    expect(fundButton(card("2"))).toBeDisabled();

    await user.type(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), "2");
    expect(freeInputCard()).toHaveTextContent("Remaining 0 ETH of 2 ETH");
    expect(contributionField(freeInputCard())).toHaveValue("0");
    expect(contributionField(freeInputCard())).toBeDisabled();
    expect(fundButton(freeInputCard())).toBeDisabled();
  });

  it("the contribution follows the remaining amount until the user edits it", async () => {
    const user = userEvent.setup();
    await renderReads([crowdfunding(), crowdfunding({ contributions: [{ ruling: 2n, amount: ETH }] }), crowdfunding({ contributions: [{ ruling: 2n, amount: 2n * ETH }] })]);
    expect(contributionField(card("No"))).toHaveValue("3");

    await nextRead(user);
    expect(contributionField(card("No"))).toHaveValue("2");

    await user.clear(contributionField(card("No")));
    await user.type(contributionField(card("No")), "0.7");
    await nextRead(user);
    expect(contributionField(card("No"))).toHaveValue("0.7");
  });

  it("a card fully funded after the user edited its contribution shows 0 and is disabled", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderReads([crowdfunding(), crowdfunding({ contributions: [{ ruling: 2n, amount: LOSER_TOTAL }] }), crowdfunding()]);
    await user.clear(contributionField(card("No")));
    await user.type(contributionField(card("No")), "0.7");

    await nextRead(user);
    expect(card("No")).toHaveTextContent("Remaining 0 ETH of 3 ETH");
    expect(contributionField(card("No"))).toHaveValue("0");
    expect(contributionField(card("No"))).toBeDisabled();
    expect(fundButton(card("No"))).toBeDisabled();

    await nextRead(user);
    expect(contributionField(card("No"))).toHaveValue("3");
    await user.click(fundButton(card("No")));
    expect(sentCalls(writes.fake)).toMatchObject([{ kind: "fund-appeal", args: [7n, 2n], value: LOSER_TOTAL }]);
  });

  it("a contribution edited for one answer is dropped when the free input's answer changes to one with its own card, which then prefills and funds that card's remaining amount", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 3n, contributions: [{ ruling: 3n, amount: ETH / 2n }] })));
    const answer = within(freeInputCard()).getByRole("textbox", { name: /Answer/ });
    await user.type(answer, "7");
    await user.clear(contributionField(freeInputCard()));
    await user.type(contributionField(freeInputCard()), "10");
    expect(contributionField(freeInputCard())).toHaveValue("10");

    await user.clear(answer);
    await user.type(answer, "2");
    expect(freeInputCard()).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(contributionField(freeInputCard())).toHaveValue("1.5");
    expect(fundButton(freeInputCard())).toBeEnabled();
    await user.click(fundButton(freeInputCard()));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, 3n], value: (3n * ETH) / 2n }]);
  });

  it("a contribution edited for one combination is dropped when the composer's ticks change to a combination with its own card, which then prefills and funds that card's remaining amount", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(
      caseDispute(
        crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D", "E"] }, currentRuling: 3n, contributions: [{ ruling: 3n, amount: ETH / 2n }] }),
      ),
    );
    await user.clear(contributionField(composerCard()));
    await user.type(contributionField(composerCard()), "10");
    expect(contributionField(composerCard())).toHaveValue("10");

    await user.click(within(composerCard()).getByRole("checkbox", { name: "B" }));
    expect(composerCard()).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(contributionField(composerCard())).toHaveValue("1.5");
    expect(fundButton(composerCard())).toBeEnabled();
    await user.click(fundButton(composerCard()));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, 3n], value: (3n * ETH) / 2n }]);
  });

  it("an amount that cannot be sent is explained and keeps Fund disabled", async () => {
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding()));
    await user.clear(contributionField(card("No")));
    expect(card("No")).toHaveTextContent("Enter an amount greater than 0.");
    expect(fundButton(card("No"))).toBeDisabled();
  });

  it("'-' typed over the prefilled amount is refused with a message and nothing is sent", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding()));
    const field = contributionField(card("No"));
    await user.type(field, "-", { initialSelectionStart: 0, initialSelectionEnd: field.value.length });

    expect(field).toHaveValue("-");
    expect(card("No")).toHaveTextContent("Enter the amount as a number, such as 0.5.");
    expect(fundButton(card("No"))).toBeDisabled();
    await user.click(fundButton(card("No")));
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("'-' typed over an edited amount is refused instead of sending the edit", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding()));
    const field = contributionField(card("No"));
    await user.clear(field);
    await user.type(field, "0.5");
    await user.type(field, "-", { initialSelectionStart: 0, initialSelectionEnd: field.value.length });

    expect(field).toHaveValue("-");
    expect(card("No")).toHaveTextContent("Enter the amount as a number, such as 0.5.");
    expect(fundButton(card("No"))).toBeDisabled();
    await user.click(fundButton(card("No")));
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("a negative amount the field turns into 0 is refused as 0", async () => {
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding()));
    const field = contributionField(card("No"));
    await user.type(field, "-", { initialSelectionStart: 0, initialSelectionEnd: 0 });

    expect(field).toHaveValue("0");
    expect(card("No")).toHaveTextContent("Enter an amount greater than 0.");
    expect(fundButton(card("No"))).toBeDisabled();
  });

  it("three options show all 8 combinations and no composer", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C"] } })));
    expect(cardTitles()).toEqual([REFUSE, "None", "A", "B", "A, B", "C", "A, C", "B, C", "A, B, C"]);
    expect(screen.queryByRole("listitem", { name: "Fund another combination" })).toBeNull();
  });

  it("four options show all 16 combinations and no composer", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D"] } })));
    expect(cardElements()).toHaveLength(17);
    expect(screen.queryByRole("listitem", { name: "Fund another combination" })).toBeNull();
  });

  it("five options show only the current and contributed combinations, plus a composer", async () => {
    const titles = ["A", "B", "C", "D", "E"];
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 3n, contributions: [{ ruling: 20n, amount: ETH }] })));
    expect(cardTitles()).toEqual([REFUSE, "B", "A, B, E"]);
    const composer = composerCard();
    expect(within(composer).getAllByRole("checkbox")).toHaveLength(5);
    expect(composer).toHaveTextContent("Answer to fund: None");
  });

  it("nine options give the composer nine options to tick", async () => {
    const user = userEvent.setup();
    const titles = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles } })));
    expect(cardTitles()).toEqual([REFUSE, "None"]);
    const composer = composerCard();
    expect(within(composer).getAllByRole("checkbox")).toHaveLength(9);
    await user.click(within(composer).getByRole("checkbox", { name: "B" }));
    await user.click(within(composer).getByRole("checkbox", { name: "I" }));
    expect(composer).toHaveTextContent("Answer to fund: B, I");
    expect(contributionField(composer)).toHaveValue("3");
  });

  it("ticking a combination that has its own card announces that card and its amounts in the composer's live region, and Fund names it", async () => {
    const user = userEvent.setup();
    const titles = ["A", "B", "C", "D", "E"];
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 3n, contributions: [{ ruling: 3n, amount: ETH / 2n }] })));
    const [region] = liveRegions(composerCard());
    expect(region).toHaveTextContent(newAnswerLine("combination"));
    expect(within(composerCard()).getByRole("button", { name: "Fund the selected combination" })).toBeInTheDocument();
    await user.click(within(composerCard()).getByRole("checkbox", { name: "B" }));
    expect(liveRegions(composerCard())).toEqual([region]);
    expect(region).toHaveTextContent(`${matchedCardLine("B")} 1.5 ETH remaining of 2 ETH.`);
    expect(within(composerCard()).getByRole("button", { name: "Fund B" })).toBeInTheDocument();
    await user.click(within(composerCard()).getByRole("checkbox", { name: "B" }));
    expect(region).toHaveTextContent(newAnswerLine("combination"));
    expect(within(composerCard()).getByRole("button", { name: "Fund the selected combination" })).toBeInTheDocument();
  });

  it("a ticked combination that has its own card shows that card's remaining amount and deadline in the composer", async () => {
    freezeClockAtAppealStart();
    const user = userEvent.setup();
    const titles = ["A", "B", "C", "D", "E"];
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 3n, contributions: [{ ruling: 3n, amount: ETH / 2n }] })));
    const composer = composerCard();
    expect(composer).toHaveTextContent("Remaining 3 ETH of 3 ETH");
    expect(within(composer).getByText(LOSER_TIME_LEFT)).toBeInTheDocument();
    await user.click(within(composer).getByRole("checkbox", { name: "B" }));
    expect(composer).toHaveTextContent("This answer has its own card, “B”: its funding is shown here.");
    expect(composer).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(contributionField(composer)).toHaveValue("1.5");
    expect(within(composer).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(within(composer).getByText(WINNER_TIME_LEFT)).toBeInTheDocument();
  });

  it("a 34-option multiple-select shows only the refuse card, the current and contributed combinations and a composer with 34 options", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    const titles = Array.from({ length: 34 }, (_, index) => `Option ${String(index + 1)}`);
    const everyOption = 1n << 34n;
    await renderSection(
      caseDispute(
        crowdfunding({
          rulingOptions: { type: "multiple-select", titles },
          currentRuling: (1n << 33n) + 1n,
          contributions: [
            { ruling: everyOption, amount: ETH },
            { ruling: everyOption + 1n, amount: ETH },
          ],
        }),
      ),
    );
    expect(cardTitles()).toEqual([REFUSE, "Option 34", titles.join(", ")]);
    const composer = composerCard();
    expect(within(composer).getAllByRole("checkbox")).toHaveLength(34);
    await user.click(within(composer).getByRole("checkbox", { name: "Option 1" }));
    await user.click(within(composer).getByRole("checkbox", { name: "Option 34" }));
    expect(composer).toHaveTextContent("Answer to fund: Option 1, Option 34");
    await user.click(fundButton(composer));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, ((1n << 33n) | 1n) + 1n], value: LOSER_TOTAL }]);
  });

  it("variable-type questions show contributed values, the current ruling at the winner amount and a free input", async () => {
    freezeClockAtAppealStart();
    const uint: RulingOptions = { type: "uint", precision: 0 };
    await renderSection(caseDispute(crowdfunding({ rulingOptions: uint, currentRuling: 3n, contributions: [{ ruling: 6n, amount: ETH }] })));
    expect(cardTitles()).toEqual([REFUSE, "5", "2"]);
    expect(card("2")).toHaveTextContent("Remaining 2 ETH of 2 ETH");
    expect(contributionField(card("2"))).toHaveValue(formatEther(WINNER_TOTAL));
    expect(within(card("2")).getByText(WINNER_TIME_LEFT)).toBeInTheDocument();
    expect(screen.queryByText("Yes")).toBeNull();
    expect(contributionField(freeInputCard())).toHaveValue("3");
  });

  it("a free-input card without an answer keeps Fund disabled", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "string" } })));
    expect(within(freeInputCard()).getByRole("textbox", { name: /Answer/ })).toHaveAttribute("placeholder", "Enter a new ruling option");
    expect(fundButton(freeInputCard())).toBeDisabled();
  });

  const encodingErrors: readonly (readonly [AnswerEncodingError, RulingOptions, string])[] = [
    ["not-a-number", { type: "uint" }, "abc"],
    ["negative-uint", { type: "uint" }, "-1"],
    ["out-of-range", { type: "int" }, "9".repeat(80)],
    ["not-hex", { type: "hash" }, "0xzz"],
    ["too-long", { type: "string" }, "a".repeat(33)],
    ["malformed", { type: "string" }, "\uD800"],
  ];

  it.each(encodingErrors)("the free input explains %s and keeps Fund disabled", async (error, rulingOptions, typed) => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: typed } });
    expect(freeInputCard()).toHaveTextContent(ANSWER_ERROR_MESSAGES[error]);
    expect(fundButton(freeInputCard())).toBeDisabled();
  });

  it.each(["1e20", "1.5", "+5", " 5", "0x10"])("an int answer written as %j is refused as not a number and keeps Fund disabled", async (typed) => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "int" } })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: typed } });
    expect(freeInputCard()).toHaveTextContent(ANSWER_ERROR_MESSAGES["not-a-number"]);
    expect(fundButton(freeInputCard())).toBeDisabled();
  });

  it("the free input explains an emptied answer", async () => {
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint" } })));
    const field = within(freeInputCard()).getByRole("textbox", { name: /Answer/ });
    await user.type(field, "4");
    expect(fundButton(freeInputCard())).toBeEnabled();
    await user.clear(field);
    expect(freeInputCard()).toHaveTextContent(ANSWER_ERROR_MESSAGES.empty);
    expect(fundButton(freeInputCard())).toBeDisabled();
  });

  it.each([
    ["-1", REFUSED_RULING_TEXT],
    ["-2", "Answered too soon"],
    ["-3", "-3"],
    ["12", "12"],
  ])("an int answer of %s shows that the card funds %s", async (typed, funded) => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "int" } })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: typed } });
    expect(freeInputCard()).toHaveTextContent(`This card funds the answer: ${funded}`);
  });

  it("an int free input has an empty live region for the answer it funds before anything is typed, which then names it", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "int" } })));
    const [intNote, matched] = liveRegions(freeInputCard());
    expect(intNote?.textContent).toBe("");
    expect(matched).toHaveTextContent(newAnswerLine("answer"));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: "-2" } });
    expect(liveRegions(freeInputCard())).toEqual([intNote, matched]);
    expect(intNote).toHaveTextContent("This card funds the answer: Answered too soon");
  });

  it("only int answers show the answer they fund", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 } })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: "5" } });
    expect(freeInputCard()).not.toHaveTextContent("This card funds the answer");
  });

  it("a governor panel has no ruling-0 card", async () => {
    await renderSection(caseDispute(crowdfunding({ family: GOVERNOR, rulingOptions: { type: "single-select", titles: ["A", "B", "C"] } }), { family: GOVERNOR }));
    expect(cardTitles()).toEqual(["A", "B", "C"]);
  });

  it("a governor tie costs every list the shared amount until the end of the appeal period", async () => {
    freezeClockAtAppealStart();
    const multipliers: Multipliers = { ...MULTIPLIERS, sharedMultiplier: 15_000n };
    const shared = ETH + (ETH * 15_000n) / 10_000n;
    await renderSection(
      caseDispute(crowdfunding({ family: GOVERNOR, currentRuling: 0n, multipliers, rulingOptions: { type: "single-select", titles: ["A", "B"] } }), {
        family: GOVERNOR,
      }),
    );
    expect(cardTitles()).toEqual(["A", "B"]);
    for (const element of cardElements()) {
      expect(element).toHaveTextContent("Remaining 2.5 ETH of 2.5 ETH");
      expect(contributionField(element)).toHaveValue(formatEther(shared));
      expect(within(element).getByText(WINNER_TIME_LEFT)).toBeInTheDocument();
    }
  });
});

describe("AppealSection: funding", () => {
  it("Fund sends fundAppeal for the card's ruling with the contribution, with a refresh for once it is mined", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card("No")));
    await waitFor(() => {
      expect(card("No")).toHaveTextContent("Transaction confirmed");
    });
    const [execution] = writes.fake.executions;
    expect(execution?.options.pageChainId).toBe(1);
    expect(execution?.options.onMined).toBeTypeOf("function");
    expect(sentCalls(writes.fake)).toMatchObject([{ kind: "fund-appeal", functionName: "fundAppeal", args: [7n, 2n], value: LOSER_TOTAL }]);
  });

  it("the contribution goes to the arbitrable the arbitrator names, on the page chain", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding()));
    await user.clear(contributionField(card("Yes")));
    await user.type(contributionField(card("Yes")), "0.5");
    await user.click(fundButton(card("Yes")));
    expect(await sentCallsAfter()).toMatchObject([{ address: TEST_ARBITRABLE, chainId: 1, args: [7n, 1n], value: ETH / 2n }]);
  });

  it("the composer funds the ticked combination", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D", "E"] } })));
    const composer = composerCard();
    await user.click(within(composer).getByRole("checkbox", { name: "A" }));
    await user.click(within(composer).getByRole("checkbox", { name: "C" }));
    await user.click(fundButton(composer));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, combinationCode([0, 2])], value: LOSER_TOTAL }]);
  });

  it("a datetime answer funds the picked date with its time of day", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "datetime" } })));
    await typeDateAnswer(user, "10202026", "1545");
    expect(fundButton(freeInputCard())).toBeEnabled();
    await user.click(fundButton(freeInputCard()));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, BigInt(Date.UTC(2026, 9, 20, 15, 45) / 1000) + 1n], value: LOSER_TOTAL }]);
  });

  it("a datetime answer is read in UTC whatever the browser's zone", async () => {
    // UTC+14: a date and time read in the browser's zone would be fourteen hours earlier than the same reading in UTC.
    setLocalTimeZone("Pacific/Kiritimati");
    onTestFinished(resetLocalTimeZone);
    expect(getLocalTimeZone()).toBe("Pacific/Kiritimati");
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "datetime" } })));
    expect(within(freeInputCard()).getByText("Answer (date and time, UTC)")).toBeInTheDocument();
    await typeDateAnswer(user, "10202026", "0030");
    await user.click(fundButton(freeInputCard()));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, BigInt(Date.UTC(2026, 9, 20, 0, 30) / 1000) + 1n], value: LOSER_TOTAL }]);
  });

  it("the free input funds the encoded answer at the loser amount", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 } })));
    await user.type(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), "41");
    await user.click(fundButton(freeInputCard()));
    expect(await sentCallsAfter()).toMatchObject([{ args: [7n, 42n], value: LOSER_TOTAL }]);
  });

  it("Fund on a large uint current ruling sends its exact code to fundAppeal", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    const large = 10n ** 18n + 1n;
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 18 }, currentRuling: large })));
    await user.click(fundButton(card("1")));
    await user.type(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), "1");
    await user.click(fundButton(freeInputCard()));
    expect(await sentCallsAfter(2)).toMatchObject([
      { args: [7n, large], value: WINNER_TOTAL },
      { args: [7n, large], value: WINNER_TOTAL },
    ]);
  });

  it("a failed funding is reported next to the card", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "The transaction reverted." }]);
    await renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card("No")));
    const alert = await within(card("No")).findByRole("alert");
    expect(alert).toHaveTextContent("The transaction reverted.");
  });

  it("a rejected funding signature is a neutral notice, not an error", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    await renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card("No")));
    expect(await within(card("No")).findByText("Transaction cancelled")).toBeInTheDocument();
    expect(within(card("No")).queryByRole("alert")).toBeNull();
  });

  it("a refused funding renders its reason and the page stays", async () => {
    const user = userEvent.setup();
    const unresolved: LocalIdResolution = { kind: "unresolved", reason: "reverted" };
    await renderSection(caseDispute(crowdfunding(), { localId: unresolved }));
    await user.click(fundButton(card("No")));
    const alert = await within(card("No")).findByRole("alert");
    expect(alert).toHaveTextContent("could not be read, so nothing was sent");
    expect(cardElements()).toHaveLength(3);
  });

  it("Fund is disabled without a wallet and the panel says one is needed, once", async () => {
    await renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D", "E"] } })), { connected: false });
    const buttons = within(screen.getByRole("list", { name: "Rulings to fund" })).getAllByRole("button", { name: /^Fund/ });
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getAllByText("Connect a wallet to fund an appeal.")).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Rulings to fund" })).queryByText("Connect a wallet to fund an appeal.")).toBeNull();
  });

  it("the contribution field stays editable without a wallet", async () => {
    const user = userEvent.setup();
    await renderSection(caseDispute(crowdfunding()), { connected: false });
    const field = contributionField(card("No"));
    expect(field).toBeEnabled();
    await user.clear(field);
    await user.type(field, "0.5");
    expect(field).toHaveValue("0.5");
  });

  it("while the wallet's switch to the page chain waits, Fund is refused visibly, sends nothing and shows the waiting switch", async () => {
    const user = userEvent.setup();
    const wallet = holdChainSwitches(createTestWallet({ chainId: 100 }));
    await renderSection(caseDispute(crowdfunding()), { wallet, connected: false });
    await act(() => wallet.connect());
    await user.click(fundButton(card("No")));
    expect(await within(card("No")).findByText("Wrong network")).toBeInTheDocument();
    expect(within(card("No")).getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
    expect(vi.mocked(writeContract)).not.toHaveBeenCalled();
  });
});

describe("AppealSection: Escrow V1 appeal", () => {
  it("the appeal button names the appeal cost in the chain's currency", async () => {
    const panel = await renderSection(
      caseDispute({ kind: "escrow-appeal", appealCost: ETH / 4n, deadline: APPEAL_END }, { chainId: 100, family: testFamily({ ...ESCROW, chainId: 100 }) }),
    );
    expect(screen.getByRole("button", { name: `Appeal - 0.25 ${chainConfig(100).currency}` })).toBeInTheDocument();
    expect(panel).toHaveTextContent("In order to appeal the decision, you need to pay the appeal cost.");
  });

  it("the appeal pays the cost read again right before signing, to the escrow's transaction, with a refresh for once it is mined", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    const executionsAtRead: number[] = [];
    const fake = writes.fake;
    const readAppealCost = vi.fn(() => {
      executionsAtRead.push(fake.executions.length);
      return Promise.resolve<Outcome<bigint>>({ ok: true, value: ETH });
    });
    await renderSection(escrowDispute(readAppealCost));
    expect(readAppealCost).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(executionsAtRead).toEqual([0]);
    expect(sentCalls(fake)).toMatchObject([{ kind: "escrow-appeal", functionName: "appeal", args: [9n], value: ETH }]);
    expect(fake.executions[0]?.options.onMined).toBeTypeOf("function");
  });

  it("an appeal cost that changed since the page loaded is shown on the button, explained, and nothing is sent until Appeal is pressed again", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    const readAppealCost = vi.fn(() => Promise.resolve<Outcome<bigint>>({ ok: true, value: 2n * ETH }));
    const panel = await renderSection(escrowDispute(readAppealCost));
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await screen.findByRole("button", { name: "Appeal - 2 ETH" })).toBeInTheDocument();
    expect(panel).toHaveTextContent("The appeal cost changed");
    expect(panel).toHaveTextContent("The appeal now costs 2 ETH. Press Appeal again to pay it. Nothing was sent.");
    expect(writes.fake.executions).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Appeal - 2 ETH" }));
    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(readAppealCost).toHaveBeenCalledTimes(2);
    expect(sentCalls(writes.fake)).toMatchObject([{ kind: "escrow-appeal", args: [9n], value: 2n * ETH }]);
    expect(panel).not.toHaveTextContent("The appeal cost changed");
  });

  it("the escrow panel has an empty status region for the cost check before Appeal is pressed", async () => {
    const panel = await renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW }));
    const region = costCheckRegion(panel);
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.textContent).toBe("");
  });

  it("while the appeal cost is read again the status region says so, and a changed cost is announced in that same region", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    const answers: ((cost: Outcome<bigint>) => void)[] = [];
    const readAppealCost = () =>
      new Promise<Outcome<bigint>>((resolve) => {
        answers.push(resolve);
      });
    const panel = await renderSection(escrowDispute(readAppealCost));
    const region = costCheckRegion(panel);
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(region).findByText(APPEAL_COST_CHECKING)).toBeInTheDocument();
    await act(async () => {
      answers[0]?.({ ok: true, value: 2n * ETH });
      await Promise.resolve();
    });
    expect(costCheckRegion(panel)).toBe(region);
    expect(region).toHaveTextContent("The appeal cost changed");
    expect(region).toHaveTextContent("The appeal now costs 2 ETH. Press Appeal again to pay it. Nothing was sent.");
    expect(region).not.toHaveTextContent(APPEAL_COST_CHECKING);
    expect(screen.getByRole("button", { name: "Appeal - 2 ETH" })).toBeInTheDocument();
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("an appeal cost that cannot be read again is reported and nothing is sent", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    const readAppealCost = () => Promise.resolve<Outcome<bigint>>({ ok: false, error: { code: "rpc-error", message: "Could not read the appeal cost: the RPC did not answer." } });
    const panel = await renderSection(escrowDispute(readAppealCost));
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panel).findByText("Appeal cost unavailable")).toBeInTheDocument();
    expect(panel).toHaveTextContent("The appeal cost could not be read again, so nothing was sent. Could not read the appeal cost: the RPC did not answer.");
    expect(screen.getByRole("button", { name: "Appeal - 1 ETH" })).toBeEnabled();
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("the Escrow V1 appeal body has no countdown", async () => {
    const panel = await renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW }));
    expect(panel).not.toHaveTextContent("Time left to appeal");
    expect(panel.querySelector("time")).toBeNull();
  });

  it("a failed Escrow V1 appeal is reported as an error", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "The transaction reverted." }]);
    const panel = await renderSection(escrowDispute());
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("The transaction reverted.");
  });

  it("a rejected Escrow V1 appeal is a neutral notice, not an error", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    const panel = await renderSection(escrowDispute());
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panel).findByText("Transaction cancelled")).toBeInTheDocument();
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("the escrow Appeal button is disabled without a wallet and the panel says one is needed", async () => {
    writes.fake = fakeWriteController(TEST_SENT);
    const panel = await renderSection(escrowDispute(), { connected: false });
    expect(screen.getByRole("button", { name: "Appeal - 1 ETH" })).toBeDisabled();
    expect(panel).toHaveTextContent("Connect a wallet to appeal.");
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("while the wallet's switch to the page chain waits, the Escrow V1 appeal is refused with the waiting switch", async () => {
    const user = userEvent.setup();
    const wallet = holdChainSwitches(createTestWallet({ chainId: 100 }));
    const panel = await renderSection(escrowDispute(), { wallet, connected: false });
    await act(() => wallet.connect());
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panel).findByText("Wrong network")).toBeInTheDocument();
    expect(within(panel).getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
  });
});

describe("AppealSection: withdraw", () => {
  const available: WithdrawState = {
    status: "available",
    beneficiary: TEST_WALLET_ADDRESS,
    total: ETH / 2n,
    items: [
      { dialect: "idr-v2", ruling: 1n, amount: ETH / 4n },
      { dialect: "idr-v2", ruling: 2n, amount: ETH / 4n },
    ],
  };

  it("shows the sum across rulings on the Withdraw button", async () => {
    const panel = await renderSection(caseDispute({ kind: "withdraw", state: available }));
    expect(screen.getByRole("button", { name: `Withdraw ${formatEther(ETH / 2n)} ETH` })).toBeInTheDocument();
    expect(panel).toHaveTextContent(/you are eligible for some reward/);
    expect(panel).toHaveTextContent(/2 transactions/);
  });

  it("the withdraw button uses the chain's currency", async () => {
    await renderSection(caseDispute({ kind: "withdraw", state: available }, { chainId: 100 }));
    expect(screen.getByRole("button", { name: `Withdraw 0.5 ${chainConfig(100).currency}` })).toBeInTheDocument();
  });

  it("with nothing to withdraw it explains why and offers no action", async () => {
    const panel = await renderSection(caseDispute({ kind: "withdraw", state: { status: "nothing" } }));
    expect(panel).toHaveTextContent(WITHDRAW_NOTHING);
    expect(panel).not.toHaveTextContent(/\d ETH/);
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("without a wallet it asks to connect one, with no button of its own", async () => {
    const panel = await renderSection(caseDispute({ kind: "withdraw", state: { status: "no-account" } }), { connected: false });
    expect(panel).not.toHaveTextContent(/\d ETH/);
    expect(panel).not.toHaveTextContent(WITHDRAW_NOTHING);
    expect(panel).toHaveTextContent(/Connect a wallet/);
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("an unreadable withdrawable amount says why", async () => {
    const panel = await renderSection(
      caseDispute({ kind: "withdraw", state: { status: "unavailable", error: { code: "rpc-error", message: "The withdrawable amount could not be read." } } }),
    );
    expect(panel).not.toHaveTextContent(/\d ETH/);
    expect(panel).not.toHaveTextContent(WITHDRAW_NOTHING);
    expect(panel).toHaveTextContent("The withdrawable amount could not be read.");
  });

  it("withdraws every ruling in one sequence, one transaction each, with a refresh for the end", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT);
    await renderSection(caseDispute({ kind: "withdraw", state: available }));
    await user.click(screen.getByRole("button", { name: "Withdraw 0.5 ETH" }));
    expect(await screen.findByText("Transaction confirmed (2 of 2)")).toBeInTheDocument();
    const [execution] = writes.fake.executions;
    expect(execution?.builds).toHaveLength(2);
    expect(sentCalls(writes.fake)).toMatchObject([
      { kind: "withdraw", functionName: "withdrawFeesAndRewardsForAllRounds", args: [7n, TEST_WALLET_ADDRESS, 1n], value: 0n },
      { kind: "withdraw", functionName: "withdrawFeesAndRewardsForAllRounds", args: [7n, TEST_WALLET_ADDRESS, 2n], value: 0n },
    ]);
    expect(execution?.options.onMined).toBeTypeOf("function");
  });

  it("while the wallet's switch to the page chain waits, Withdraw is refused with the waiting switch", async () => {
    const user = userEvent.setup();
    const wallet = holdChainSwitches(createTestWallet({ chainId: 100 }));
    await renderSection(caseDispute({ kind: "withdraw", state: available }), { wallet, connected: false });
    await act(() => wallet.connect());
    await user.click(screen.getByRole("button", { name: "Withdraw 0.5 ETH" }));
    expect(await screen.findByText("Wrong network (1 of 2)")).toBeInTheDocument();
    expect(screen.getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
  });
});
