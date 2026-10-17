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
  type RulingAmount,
  type RulingOptions,
  type WithdrawState,
  type WriteCall,
} from "@dispute-resolver/core";
import { getLocalTimeZone, resetLocalTimeZone, setLocalTimeZone } from "@internationalized/date";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { CaseDispute, CaseWriteContext, SectionData } from "../../data";
import { TEST_ARBITRABLE, sectionLoading, sectionReady, sectionUnavailable, testFamily, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { TEST_TX_HASH, TEST_WALLET_ADDRESS, createTestWallet, fakeWriteController, testReceipt, type FakeWriteController, type TestWallet } from "../../test/wallet";
import type { WriteStatus } from "../../wallet";
import { AppealSection } from "./AppealSection";
import { ANSWER_ERROR_MESSAGES } from "./answer";

/** `null`: the wallet's real write hooks, whose chain guard runs before anything is signed (B3). Otherwise the fake. */
const writes = vi.hoisted((): { fake: FakeWriteController | null } => ({ fake: null }));

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
const LOSER_DEADLINE = APPEAL_START + (APPEAL_END - APPEAL_START) / 2;
const LOCAL_ID: LocalIdResolution = { kind: "local-id", value: 7n };
const YES_NO: RulingOptions = { type: "single-select", titles: ["Yes", "No"] };

const MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: testReceipt() };
const SENT: readonly WriteStatus[] = [{ phase: "pending" }, { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null }, MINED];

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
  readonly localId?: LocalIdResolution;
  readonly rulingOptions?: RulingOptions;
  readonly currentRuling?: bigint;
  readonly contributions?: readonly RulingAmount[];
  readonly multipliers?: Multipliers;
}

/** A period-3 panel built by core, as `useCase` assembles it. */
function crowdfunding(options: PanelOptions = {}): AppealPanel {
  const input: AppealPanelInput = {
    family: options.family ?? testFamily(),
    period: 3,
    localId: options.localId ?? LOCAL_ID,
    override: undefined,
    rulingOptions: options.rulingOptions ?? YES_NO,
    fallbackOutcomes: null,
    currentRuling: { ok: true, value: options.currentRuling ?? 1n },
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
}

function caseDispute(panel: AppealPanel | SectionData<AppealPanel>, options: DisputeOptions = {}): CaseDispute {
  const chainId = options.chainId ?? 1;
  const family = options.family ?? testFamily({ chainId });
  const lookup = testFoundLookup({ chainId, period: 3 });
  const context: CaseWriteContext = { binding: lookup.binding, family, localId: options.localId ?? LOCAL_ID, override: undefined, appealInfo: APPEAL_INFO };
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
    appealPanel: "status" in panel ? panel : sectionReady(panel),
    write: options.write ?? sectionReady(context),
  };
}

function renderSection(dispute: CaseDispute, wallet?: TestWallet) {
  return renderWithProviders(<AppealSection dispute={dispute} chain={chainConfig(dispute.chainId)} />, { path: `/${String(dispute.chainId)}`, wallet });
}

function panelElement(): HTMLElement {
  return screen.getByTestId("appeal-panel");
}

function cardElements(): HTMLElement[] {
  return screen.queryAllByTestId("appeal-card");
}

function cardCodes(): (string | null)[] {
  return cardElements().map((card) => card.getAttribute("data-code"));
}

function card(code: bigint): HTMLElement {
  const found = cardElements().find((element) => element.getAttribute("data-code") === code.toString());
  if (found === undefined) throw new Error(`No card with code ${code.toString()}.`);
  return found;
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

/** Renders the section over successive reads of its panel; "Next read" moves to the next one, as a refresh would. */
function renderReads(reads: readonly AppealPanel[]) {
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
  return renderWithProviders(<Changing />, { path: "/1" });
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

function composerCard(): HTMLElement {
  return screen.getByRole("listitem", { name: "Fund another combination" });
}

beforeEach(() => {
  writes.fake = null;
});

describe("AppealSection: section states (spec §5.11, D-36)", () => {
  it("§5.11: shows a placeholder while the panel loads, without a panel kind", () => {
    renderSection(caseDispute(sectionLoading));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("appeal-panel")).toBeNull();
  });

  it("D-36: an unavailable panel says why, with a retry", () => {
    renderSection(caseDispute(sectionUnavailable("not-found", "This dispute has no meta-evidence, so its ruling options are unknown.")));
    expect(screen.getByText("Appeal unavailable")).toBeInTheDocument();
    expect(screen.getByText("This dispute has no meta-evidence, so its ruling options are unknown.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Appeal" })).toBeInTheDocument();
  });
});

describe("AppealSection: panel kinds (06 §1, §12.1)", () => {
  const kinds: readonly (readonly [AppealPanel["kind"], AppealPanel])[] = [
    ["hidden", { kind: "hidden" }],
    ["handled-by-arbitrable", { kind: "handled-by-arbitrable" }],
    ["escrow-appeal", { kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }],
    ["escrow-ended", { kind: "escrow-ended" }],
    ["crowdfunding", crowdfunding()],
    ["fees-unavailable", { kind: "fees-unavailable", error: { code: "unsupported", message: "The appeal multipliers could not be read." } }],
    ["withdraw", { kind: "withdraw", state: { status: "nothing" } }],
    ["withdraw-unsupported", { kind: "withdraw-unsupported" }],
  ];

  it.each(kinds)("§12.1: writes data-kind %s on the panel", (kind, panel) => {
    renderSection(caseDispute(panel));
    expect(panelElement()).toHaveAttribute("data-kind", kind);
  });

  it("§12.1: hidden renders the hook only, with nothing to read", () => {
    renderSection(caseDispute({ kind: "hidden" }));
    expect(panelElement()).toBeEmptyDOMElement();
  });

  it("D-47: a family with no funding interface says appeals happen in the arbitrable application", () => {
    renderSection(caseDispute({ kind: "handled-by-arbitrable" }));
    expect(panelElement()).toHaveTextContent(/handled in the arbitrable application/);
  });

  it("B10: a family with no funding interface offers no action that sends value", () => {
    renderSection(caseDispute({ kind: "handled-by-arbitrable" }));
    expect(within(panelElement()).queryAllByRole("button")).toHaveLength(0);
    expect(cardElements()).toHaveLength(0);
  });

  it("§10.2: Escrow V1 in execution says the appeal period ended", () => {
    renderSection(caseDispute({ kind: "escrow-ended" }));
    expect(panelElement()).toHaveTextContent("Appeal period ended");
  });

  it("D-46: idr-legacy in execution says withdrawals are not supported through the resolver", () => {
    renderSection(caseDispute({ kind: "withdraw-unsupported" }));
    expect(panelElement()).toHaveTextContent(/Withdrawals are not supported through the Dispute Resolver for this contract/);
    expect(panelElement()).not.toHaveAttribute("data-withdrawable-wei");
    expect(within(panelElement()).queryByRole("button")).toBeNull();
  });

  it("§5.11: fees that cannot be calculated show the notice with the reason, and no cards", () => {
    renderSection(caseDispute({ kind: "fees-unavailable", error: { code: "rpc-error", message: "The RPC did not answer." } }));
    expect(panelElement()).toHaveTextContent("Appeal fees could not be calculated");
    expect(panelElement()).toHaveTextContent("The RPC did not answer.");
    expect(cardElements()).toHaveLength(0);
  });

  it("D-43: the appeal-period text never carries the withdraw sentence", () => {
    renderSection(caseDispute(crowdfunding()));
    expect(panelElement()).toHaveTextContent(/fully fund the crowdfunding deposit/);
    expect(panelElement()).not.toHaveTextContent(/You don't have any amount to withdraw/);
    expect(panelElement()).toHaveTextContent(/Rewards only apply if both sides are funded/);
  });

  it("§5.11: actions name the write context's failure when it could not be read", () => {
    renderSection(caseDispute(crowdfunding(), { write: sectionUnavailable("rpc-error", "The dispute details could not be read.") }));
    expect(panelElement()).toHaveTextContent("The dispute details could not be read.");
    expect(fundButton(card(1n))).toBeDisabled();
  });
});

describe("AppealSection: crowdfunding cards (spec §5.12)", () => {
  it("§12.1: each card carries its code, funded percent, remaining wei and deadline, and its title", () => {
    renderSection(caseDispute(crowdfunding({ contributions: [{ ruling: 1n, amount: ETH / 2n }] })));
    expect(cardCodes()).toEqual(["0", "1", "2"]);
    expect(card(1n)).toHaveAttribute("data-funded-percent", "25");
    expect(card(1n)).toHaveAttribute("data-remaining-wei", (WINNER_TOTAL - ETH / 2n).toString());
    expect(card(1n)).toHaveAttribute("data-deadline", APPEAL_END.toString());
    expect(card(2n)).toHaveAttribute("data-remaining-wei", LOSER_TOTAL.toString());
    expect(card(2n)).toHaveAttribute("data-deadline", LOSER_DEADLINE.toString());
    expect(within(card(0n)).getByTestId("appeal-card-title")).toHaveTextContent("Invalid / Refused to Arbitrate / Tied");
    expect(within(card(2n)).getByTestId("appeal-card-title")).toHaveTextContent("No");
  });

  it("§5.12: the current ruling's card says it is the latest jury decision, and shows its funding", () => {
    renderSection(caseDispute(crowdfunding({ contributions: [{ ruling: 1n, amount: ETH / 2n }] })));
    expect(card(1n)).toHaveTextContent("Latest jury decision");
    expect(card(2n)).not.toHaveTextContent("Latest jury decision");
    expect(within(card(1n)).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(card(1n)).toHaveTextContent("25.00% Funded");
    expect(card(1n)).toHaveTextContent("1.5 ETH");
  });

  it("P-21: a fixed card shows its remaining amount and total, the free-input card its required total", () => {
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 }, contributions: [{ ruling: 1n, amount: ETH / 2n }] })));
    expect(card(1n)).toHaveTextContent("Remaining 1.5 ETH of 2 ETH");
    expect(freeInputCard()).toHaveTextContent("Required 3 ETH");
  });

  it("§5.12: the contribution is prefilled with the remaining amount", () => {
    renderSection(caseDispute(crowdfunding()));
    expect(contributionField(card(2n))).toHaveValue("3");
    expect(fundButton(card(2n))).toBeEnabled();
  });

  it("§5.12: a fully funded card shows 0 and disables its contribution and Fund", () => {
    renderSection(caseDispute(crowdfunding({ contributions: [{ ruling: 2n, amount: LOSER_TOTAL }] })));
    expect(contributionField(card(2n))).toHaveValue("0");
    expect(contributionField(card(2n))).toBeDisabled();
    expect(fundButton(card(2n))).toBeDisabled();
  });

  it("D-54: the contribution follows the remaining amount until the user edits it", async () => {
    const user = userEvent.setup();
    renderReads([crowdfunding(), crowdfunding({ contributions: [{ ruling: 2n, amount: ETH }] }), crowdfunding({ contributions: [{ ruling: 2n, amount: 2n * ETH }] })]);
    expect(contributionField(card(2n))).toHaveValue("3");

    await nextRead(user);
    expect(contributionField(card(2n))).toHaveValue("2");

    await user.clear(contributionField(card(2n)));
    await user.type(contributionField(card(2n)), "0.7");
    await nextRead(user);
    expect(contributionField(card(2n))).toHaveValue("0.7");
  });

  it("CA-4, §5.12: a card fully funded after the user edited its contribution shows 0 and is disabled", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderReads([crowdfunding(), crowdfunding({ contributions: [{ ruling: 2n, amount: LOSER_TOTAL }] }), crowdfunding()]);
    await user.clear(contributionField(card(2n)));
    await user.type(contributionField(card(2n)), "0.7");

    await nextRead(user);
    expect(card(2n)).toHaveAttribute("data-remaining-wei", "0");
    expect(contributionField(card(2n))).toHaveValue("0");
    expect(contributionField(card(2n))).toBeDisabled();
    expect(fundButton(card(2n))).toBeDisabled();

    await nextRead(user);
    expect(contributionField(card(2n))).toHaveValue("3");
    await user.click(fundButton(card(2n)));
    expect(sentCalls(writes.fake)).toMatchObject([{ kind: "fund-appeal", args: [7n, 2n], value: LOSER_TOTAL }]);
  });

  it("D-14: an amount that cannot be sent is explained and keeps Fund disabled", async () => {
    const user = userEvent.setup();
    renderSection(caseDispute(crowdfunding()));
    await user.clear(contributionField(card(2n)));
    expect(card(2n)).toHaveTextContent("Enter an amount greater than 0.");
    expect(fundButton(card(2n))).toBeDisabled();
  });

  it("CA-3, D-14: '-' typed over the prefilled amount is refused with a message and nothing is sent", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding()));
    const field = contributionField(card(2n));
    await user.type(field, "-", { initialSelectionStart: 0, initialSelectionEnd: field.value.length });

    expect(field).toHaveValue("-");
    expect(card(2n)).toHaveTextContent("Enter the amount as a number, such as 0.5.");
    expect(fundButton(card(2n))).toBeDisabled();
    await user.click(fundButton(card(2n)));
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("CA-3, D-14: '-' typed over an edited amount is refused instead of sending the edit", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding()));
    const field = contributionField(card(2n));
    await user.clear(field);
    await user.type(field, "0.5");
    await user.type(field, "-", { initialSelectionStart: 0, initialSelectionEnd: field.value.length });

    expect(field).toHaveValue("-");
    expect(card(2n)).toHaveTextContent("Enter the amount as a number, such as 0.5.");
    expect(fundButton(card(2n))).toBeDisabled();
    await user.click(fundButton(card(2n)));
    expect(writes.fake.executions).toHaveLength(0);
  });

  it("CA-3, D-14: a negative amount the field turns into 0 is refused as 0", async () => {
    const user = userEvent.setup();
    renderSection(caseDispute(crowdfunding()));
    const field = contributionField(card(2n));
    await user.type(field, "-", { initialSelectionStart: 0, initialSelectionEnd: 0 });

    expect(field).toHaveValue("0");
    expect(card(2n)).toHaveTextContent("Enter an amount greater than 0.");
    expect(fundButton(card(2n))).toBeDisabled();
  });

  it("D-33: three options show all 8 combinations and no composer", () => {
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C"] } })));
    expect(cardCodes()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(within(card(1n)).getByTestId("appeal-card-title")).toHaveTextContent("None");
    expect(within(card(6n)).getByTestId("appeal-card-title")).toHaveTextContent("A C");
    expect(screen.queryByRole("listitem", { name: "Fund another combination" })).toBeNull();
  });

  it("D-33: four options show all 16 combinations and no composer", () => {
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D"] } })));
    expect(cardElements()).toHaveLength(17);
    expect(screen.queryByRole("listitem", { name: "Fund another combination" })).toBeNull();
  });

  it("D-33: five options show only the current and contributed combinations, plus a composer", () => {
    const titles = ["A", "B", "C", "D", "E"];
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 3n, contributions: [{ ruling: 20n, amount: ETH }] })));
    expect(cardCodes()).toEqual(["0", "3", "20"]);
    const composer = composerCard();
    expect(within(composer).getAllByRole("checkbox")).toHaveLength(5);
    expect(composer).toHaveTextContent("Answer to fund: None");
  });

  it("D-33: nine options give the composer nine options to tick", async () => {
    const user = userEvent.setup();
    const titles = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles } })));
    expect(cardCodes()).toEqual(["0", "1"]);
    const composer = composerCard();
    expect(within(composer).getAllByRole("checkbox")).toHaveLength(9);
    await user.click(within(composer).getByRole("checkbox", { name: "B" }));
    await user.click(within(composer).getByRole("checkbox", { name: "I" }));
    expect(composer).toHaveTextContent("Answer to fund: B I");
    expect(contributionField(composer)).toHaveValue("3");
  });

  it("D-04: variable-type questions show contributed values, the current ruling at the winner amount and a free input", () => {
    const uint: RulingOptions = { type: "uint", precision: 0 };
    renderSection(caseDispute(crowdfunding({ rulingOptions: uint, currentRuling: 3n, contributions: [{ ruling: 6n, amount: ETH }] })));
    expect(cardCodes()).toEqual(["0", "6", "3"]);
    expect(within(card(6n)).getByTestId("appeal-card-title")).toHaveTextContent("5");
    expect(within(card(3n)).getByTestId("appeal-card-title")).toHaveTextContent("2");
    expect(card(3n)).toHaveAttribute("data-remaining-wei", WINNER_TOTAL.toString());
    expect(card(3n)).toHaveAttribute("data-deadline", APPEAL_END.toString());
    expect(screen.queryByText("Yes")).toBeNull();
    expect(contributionField(freeInputCard())).toHaveValue("3");
  });

  it("§5.12: a free-input card without an answer keeps Fund disabled", () => {
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "string" } })));
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

  it.each(encodingErrors)("WN-3: the free input explains %s and keeps Fund disabled", (error, rulingOptions, typed) => {
    renderSection(caseDispute(crowdfunding({ rulingOptions })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: typed } });
    expect(freeInputCard()).toHaveTextContent(ANSWER_ERROR_MESSAGES[error]);
    expect(fundButton(freeInputCard())).toBeDisabled();
  });

  it("WN-3: the free input explains an emptied answer", async () => {
    const user = userEvent.setup();
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint" } })));
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
  ])("P-21: an int answer of %s shows that the card funds %s", (typed, funded) => {
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "int" } })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: typed } });
    expect(freeInputCard()).toHaveTextContent(`This card funds the answer: ${funded}`);
  });

  it("P-21: only int answers show the answer they fund", () => {
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 } })));
    fireEvent.change(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), { target: { value: "5" } });
    expect(freeInputCard()).not.toHaveTextContent("This card funds the answer");
  });

  it("P-04: a governor panel has no ruling-0 card", () => {
    renderSection(
      caseDispute(crowdfunding({ family: GOVERNOR, localId: { kind: "not-applicable" }, rulingOptions: { type: "single-select", titles: ["A", "B", "C"] } }), { family: GOVERNOR }),
    );
    expect(cardCodes()).toEqual(["1", "2", "3"]);
  });

  it("P-05: a governor tie costs every list the shared amount until the end of the appeal period", () => {
    const multipliers: Multipliers = { ...MULTIPLIERS, sharedMultiplier: 15_000n };
    const shared = ETH + (ETH * 15_000n) / 10_000n;
    renderSection(
      caseDispute(
        crowdfunding({ family: GOVERNOR, localId: { kind: "not-applicable" }, currentRuling: 0n, multipliers, rulingOptions: { type: "single-select", titles: ["A", "B"] } }),
        {
          family: GOVERNOR,
        },
      ),
    );
    expect(cardCodes()).toEqual(["1", "2"]);
    for (const element of cardElements()) {
      expect(element).toHaveAttribute("data-remaining-wei", shared.toString());
      expect(element).toHaveAttribute("data-deadline", APPEAL_END.toString());
    }
  });
});

describe("AppealSection: funding (spec §5.12 fund action, §6.1)", () => {
  it("§5.12: Fund sends fundAppeal for the card's ruling with the contribution, with a refresh for once it is mined", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card(2n)));
    await waitFor(() => {
      expect(card(2n)).toHaveTextContent("Transaction confirmed");
    });
    const [execution] = writes.fake.executions;
    expect(execution?.options.pageChainId).toBe(1);
    expect(execution?.options.onMined).toBeTypeOf("function");
    expect(sentCalls(writes.fake)).toMatchObject([{ kind: "fund-appeal", functionName: "fundAppeal", args: [7n, 2n], value: LOSER_TOTAL }]);
  });

  it("B10: the contribution goes to the arbitrable the arbitrator names, on the page chain", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding()));
    await user.clear(contributionField(card(1n)));
    await user.type(contributionField(card(1n)), "0.5");
    await user.click(fundButton(card(1n)));
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    expect(sentCalls(writes.fake)).toMatchObject([{ address: TEST_ARBITRABLE, chainId: 1, args: [7n, 1n], value: ETH / 2n }]);
  });

  it("D-33: the composer funds the ticked combination", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D", "E"] } })));
    const composer = composerCard();
    await user.click(within(composer).getByRole("checkbox", { name: "A" }));
    await user.click(within(composer).getByRole("checkbox", { name: "C" }));
    await user.click(fundButton(composer));
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    expect(sentCalls(writes.fake)).toMatchObject([{ args: [7n, combinationCode([0, 2])], value: LOSER_TOTAL }]);
  });

  it("D-17: a datetime answer funds the picked date with its time of day", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "datetime" } })));
    await typeDateAnswer(user, "10202026", "1545");
    expect(fundButton(freeInputCard())).toBeEnabled();
    await user.click(fundButton(freeInputCard()));
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    expect(sentCalls(writes.fake)).toMatchObject([{ args: [7n, BigInt(Date.UTC(2026, 9, 20, 15, 45) / 1000) + 1n], value: LOSER_TOTAL }]);
  });

  it("P-18: a datetime answer is read in UTC whatever the browser's zone", async () => {
    // UTC+14: a date and time read in the browser's zone would be fourteen hours earlier than the same reading in UTC.
    setLocalTimeZone("Pacific/Kiritimati");
    onTestFinished(resetLocalTimeZone);
    expect(getLocalTimeZone()).toBe("Pacific/Kiritimati");
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "datetime" } })));
    expect(within(freeInputCard()).getByText("Answer (date and time, UTC)")).toBeInTheDocument();
    await typeDateAnswer(user, "10202026", "0030");
    await user.click(fundButton(freeInputCard()));
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    expect(sentCalls(writes.fake)).toMatchObject([{ args: [7n, BigInt(Date.UTC(2026, 9, 20, 0, 30) / 1000) + 1n], value: LOSER_TOTAL }]);
  });

  it("D-15: the free input funds the encoded answer at the loser amount", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute(crowdfunding({ rulingOptions: { type: "uint", precision: 0 } })));
    await user.type(within(freeInputCard()).getByRole("textbox", { name: /Answer/ }), "41");
    await user.click(fundButton(freeInputCard()));
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    expect(sentCalls(writes.fake)).toMatchObject([{ args: [7n, 42n], value: LOSER_TOTAL }]);
  });

  it("D-07: a failed funding is reported next to the card", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "The transaction reverted." }]);
    renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card(2n)));
    const alert = await within(card(2n)).findByRole("alert");
    expect(alert).toHaveTextContent("The transaction reverted.");
  });

  it("D-07: a rejected signature is a neutral notice, not an error", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card(2n)));
    expect(await within(card(2n)).findByText("Transaction cancelled")).toBeInTheDocument();
    expect(within(card(2n)).queryByRole("alert")).toBeNull();
  });

  it("D-14: a refused funding renders its reason and the page stays", async () => {
    const user = userEvent.setup();
    const unresolved: LocalIdResolution = { kind: "unresolved", reason: "reverted" };
    renderSection(caseDispute(crowdfunding({ localId: unresolved }), { localId: unresolved }));
    await user.click(fundButton(card(2n)));
    const alert = await within(card(2n)).findByRole("alert");
    expect(alert).toHaveTextContent("could not be read, so nothing was sent");
    expect(cardElements()).toHaveLength(3);
  });

  it("§6.1: funding without a wallet asks for one", async () => {
    const user = userEvent.setup();
    renderSection(caseDispute(crowdfunding()));
    await user.click(fundButton(card(2n)));
    expect(await within(card(2n)).findByText("Wallet required")).toBeInTheDocument();
    expect(within(card(2n)).getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("B3: refuses to fund when the wallet is on another chain, and offers the switch", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    renderSection(caseDispute(crowdfunding()), wallet);
    await act(() => wallet.connect());
    await user.click(fundButton(card(2n)));
    expect(await within(card(2n)).findByText("Wrong network")).toBeInTheDocument();
    expect(within(card(2n)).getByRole("button", { name: /^Switch to/ })).toBeInTheDocument();
  });
});

describe("AppealSection: Escrow V1 appeal (spec §10.2)", () => {
  it("D-10: the appeal button names the appeal cost in the chain's currency", () => {
    renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH / 4n, deadline: APPEAL_END }, { chainId: 100, family: testFamily({ ...ESCROW, chainId: 100 }) }));
    expect(screen.getByRole("button", { name: `Appeal - 0.25 ${chainConfig(100).currency}` })).toBeInTheDocument();
    expect(panelElement()).toHaveTextContent("In order to appeal the decision, you need to pay the appeal cost.");
  });

  it("§10.2: the appeal pays the appeal cost to the escrow's transaction, with a refresh for once it is mined", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    const transactionId: LocalIdResolution = { kind: "transaction-id", value: 9n };
    renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW, localId: transactionId }));
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(sentCalls(writes.fake)).toMatchObject([{ kind: "escrow-appeal", functionName: "appeal", args: [9n], value: ETH }]);
    expect(writes.fake.executions[0]?.options.onMined).toBeTypeOf("function");
  });

  it("§5.11, §10.2: the Escrow V1 appeal body has no countdown", () => {
    renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW }));
    expect(panelElement()).not.toHaveTextContent("Time left to appeal");
    expect(panelElement().querySelector("time")).toBeNull();
  });

  it("§11.2, D-07: a failed Escrow V1 appeal is reported as an error", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "The transaction reverted." }]);
    renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW, localId: { kind: "transaction-id", value: 9n } }));
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panelElement()).findByRole("alert")).toHaveTextContent("The transaction reverted.");
  });

  it("§11.2, D-07: a rejected Escrow V1 appeal is a neutral notice, not an error", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW, localId: { kind: "transaction-id", value: 9n } }));
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panelElement()).findByText("Transaction cancelled")).toBeInTheDocument();
    expect(within(panelElement()).queryByRole("alert")).toBeNull();
  });

  it("B3: refuses the Escrow V1 appeal when the wallet is on another chain, and offers the switch", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    renderSection(caseDispute({ kind: "escrow-appeal", appealCost: ETH, deadline: APPEAL_END }, { family: ESCROW, localId: { kind: "transaction-id", value: 9n } }), wallet);
    await act(() => wallet.connect());
    await user.click(screen.getByRole("button", { name: "Appeal - 1 ETH" }));
    expect(await within(panelElement()).findByText("Wrong network")).toBeInTheDocument();
    expect(within(panelElement()).getByRole("button", { name: /^Switch to/ })).toBeInTheDocument();
  });
});

describe("AppealSection: withdraw (spec §5.15, D-51)", () => {
  const available: WithdrawState = {
    status: "available",
    beneficiary: TEST_WALLET_ADDRESS,
    total: ETH / 2n,
    items: [
      { dialect: "idr-v2", ruling: 1n, amount: ETH / 4n },
      { dialect: "idr-v2", ruling: 2n, amount: ETH / 4n },
    ],
  };

  it("D-51: shows the sum across rulings and writes it on the panel", () => {
    renderSection(caseDispute({ kind: "withdraw", state: available }));
    expect(panelElement()).toHaveAttribute("data-withdrawable-wei", (ETH / 2n).toString());
    expect(screen.getByRole("button", { name: "Withdraw 0.5 ETH" })).toBeInTheDocument();
    expect(panelElement()).toHaveTextContent(/you are eligible for some reward/);
    expect(panelElement()).toHaveTextContent(/2 transactions/);
  });

  it("D-10: the withdraw button uses the chain's currency", () => {
    renderSection(caseDispute({ kind: "withdraw", state: available }, { chainId: 100 }));
    expect(screen.getByRole("button", { name: `Withdraw 0.5 ${chainConfig(100).currency}` })).toBeInTheDocument();
  });

  it("§5.15: with nothing to withdraw it explains why and offers no action", () => {
    renderSection(caseDispute({ kind: "withdraw", state: { status: "nothing" } }));
    expect(panelElement()).toHaveAttribute("data-withdrawable-wei", "0");
    expect(panelElement()).toHaveTextContent(/You don't have any amount to withdraw/);
    expect(within(panelElement()).queryByRole("button")).toBeNull();
  });

  it("P-22: without a wallet it asks to connect one, with no button of its own", () => {
    renderSection(caseDispute({ kind: "withdraw", state: { status: "no-account" } }));
    expect(panelElement()).not.toHaveAttribute("data-withdrawable-wei");
    expect(panelElement()).toHaveTextContent(/Connect a wallet/);
    expect(within(panelElement()).queryByRole("button")).toBeNull();
  });

  it("D-36: an unreadable withdrawable amount says why", () => {
    renderSection(caseDispute({ kind: "withdraw", state: { status: "unavailable", error: { code: "rpc-error", message: "The withdrawable amount could not be read." } } }));
    expect(panelElement()).not.toHaveAttribute("data-withdrawable-wei");
    expect(panelElement()).toHaveTextContent("The withdrawable amount could not be read.");
  });

  it("D-51: withdraws every ruling in one sequence, one transaction each, with a refresh for the end", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(SENT);
    renderSection(caseDispute({ kind: "withdraw", state: available }));
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

  it("B3: refuses to withdraw when the wallet is on another chain", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    renderSection(caseDispute({ kind: "withdraw", state: available }), wallet);
    await act(() => wallet.connect());
    await user.click(screen.getByRole("button", { name: "Withdraw 0.5 ETH" }));
    expect(await screen.findByText("Wrong network (1 of 2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Switch to/ })).toBeInTheDocument();
  });
});
