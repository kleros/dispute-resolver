import * as core from "@dispute-resolver/core";
import type { DisputeEventResult, DisputeLookup, EvidenceList, FamilyDetection, MetaEvidenceResult, Outcome, Period } from "@dispute-resolver/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence, TEST_ARBITRABLE } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { renderWithProviders } from "../../test/shell";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { CasePage } from "./index";
import { SEARCH_DEBOUNCE_MS } from "./useDisputeSearch";

vi.mock("@dispute-resolver/core", async (importOriginal) => {
  const mocked = await (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal);
  return { ...mocked, realityNotice: vi.fn(mocked.realityNotice) };
});

const actualCore = await vi.importActual<typeof core>("@dispute-resolver/core");

const EVIDENCE: EvidenceList = { items: [], hiddenEvidenceCount: 0, hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 } };
const FOUND_EVENT: Outcome<DisputeEventResult> = {
  ok: true,
  value: { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01" } },
};
const GOVERNOR: FamilyDetection = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});
const SEARCH_WAIT = { timeout: SEARCH_DEBOUNCE_MS * 3 };

interface Program {
  readonly period?: Period;
  readonly family?: FamilyDetection;
  /** Lookups by dispute ID; an ID without one is not found. */
  readonly lookups?: Readonly<Record<string, DisputeLookup>>;
  /** Meta-evidence by dispute ID; an ID without one has the test meta-evidence. */
  readonly metaEvidence?: Readonly<Record<string, MetaEvidenceResult | "pending">>;
}

/** Programs core's reads (S-7): dispute 1 on chain 1 by default, in `period`, every read successful. */
function programReads(program: Program = {}): void {
  const period = program.period ?? 0;
  const lookups = program.lookups ?? { "1": testFoundLookup({ period }) };
  vi.mocked(core.lookupDispute).mockImplementation((_context, id) => Promise.resolve(lookups[id.toString()] ?? { status: "not-found" }));
  vi.mocked(core.detectFamily).mockResolvedValue(program.family ?? testFamily());
  vi.mocked(core.loadMetaEvidence).mockImplementation((context) => {
    const result = program.metaEvidence?.[context.disputeId.toString()] ?? testOkMetaEvidence({ title: `Dispute ${context.disputeId.toString()} title` });
    return result === "pending" ? new Promise<MetaEvidenceResult>(() => undefined) : Promise.resolve(result);
  });
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt({ name: "General Court" })] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(
      testDetails(
        { status: "found", ...found },
        { appealInfo: found.dispute.period >= 3 ? { ok: true, value: { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } : null },
      ),
    ),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
  vi.mocked(core.readRoundFunding).mockImplementation((_context, round) => Promise.resolve({ ok: true, value: { round, contributions: [], fundedRulings: [] } }));
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });
}

/** Moves the app to another URL, as the header or a chain change would. */
function GoTo({ to }: { readonly to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(to);
      }}
    >
      Go to {to}
    </button>
  );
}

/** The case page under the app's `/:chainId` layout, at the route the app serves it on (S-2). */
function renderCase(path: string, goTo?: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="cases/:id?" element={<CasePage />} />
      </Routes>
      {goTo === undefined ? null : <GoTo to={goTo} />}
    </>,
    { path },
  );
}

function page(): HTMLElement {
  return screen.getByTestId("case-page");
}

async function settledDispute(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(page()).toHaveAttribute("data-state", "dispute");
    expect(page()).toHaveAttribute("data-compatibility");
  });
  return page();
}

function searchField(): HTMLElement {
  return screen.getByRole("textbox", { name: "Dispute ID" });
}

async function search(text: string) {
  const user = userEvent.setup();
  await user.clear(searchField());
  if (text !== "") await user.type(searchField(), text);
}

function accordionButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/**
 * The body of an accordion item, a region labelled after it. A collapsed one is hidden, and a hidden element has no
 * accessible name, so the region is matched on its label.
 */
function accordionBody(name: string): HTMLElement {
  const body = screen.getAllByRole("region", { hidden: true }).find((region) => region.getAttribute("aria-label") === name);
  if (body === undefined) throw new Error(`No accordion body for ${name}.`);
  return body;
}

let breakRealityNotice = false;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no ResizeObserver, which the library accordion uses; this double stubs it with the rest of the browser surface.
  installOfflineAppKitEnvironment();
  breakRealityNotice = false;
  vi.mocked(core.realityNotice).mockImplementation((question) => {
    if (breakRealityNotice) throw new Error("Malformed Reality question");
    return actualCore.realityNotice(question);
  });
  programReads();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("case page states (spec 5.1, 5.4, §12.1)", () => {
  it("D-09: the case page without an ID shows the search box and loads no dispute", () => {
    renderCase("/1/cases");
    expect(page()).toHaveAttribute("data-state", "no-id");
    expect(searchField()).toHaveValue("");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("A19: an ID that does not parse is the not-found state, read nowhere and linked nowhere", () => {
    renderCase("/1/cases/abc");
    expect(page()).toHaveAttribute("data-state", "not-found");
    expect(screen.getByRole("heading", { name: "Dispute with ID abc does not exist on this network." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(document.querySelectorAll("a[href*='abc']")).toHaveLength(0);
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("spec 5.4: a dispute the arbitrator does not know shows the not-found state with a link to Ongoing", async () => {
    renderCase("/1/cases/42");
    await waitFor(() => {
      expect(page()).toHaveAttribute("data-state", "not-found");
    });
    expect(screen.getByRole("heading", { name: "Dispute with ID 42 does not exist on this network." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.queryByRole("heading", { name: "Dispute #42" })).not.toBeInTheDocument();
    expect(searchField()).toHaveValue("42");
  });

  it("spec 5.4: a chain without an arbitrator shows the not-found copy and reads nothing", () => {
    renderCase("/137/cases/5");
    expect(page()).toHaveAttribute("data-state", "no-arbitrator");
    expect(screen.getByRole("heading", { name: "Dispute with ID 5 does not exist on this network." })).toBeInTheDocument();
    expect(screen.getByText(/There is no arbitrator on/)).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("D-36: a lookup that fails in transport is unavailable, not missing, with a Retry that reads it again", async () => {
    vi.mocked(core.lookupDispute).mockRejectedValueOnce(new Error("socket hang up"));
    renderCase("/1/cases/1");
    await waitFor(() => {
      expect(page()).toHaveAttribute("data-state", "unavailable");
    });
    expect(screen.getByRole("heading", { name: "Dispute #1 could not be loaded" })).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry loading dispute 1" }));
    await settledDispute();
    expect(core.lookupDispute).toHaveBeenCalledTimes(2);
  });

  it("§12.1: a found dispute writes its state, arbitrable, family, compatibility, period and last period change", async () => {
    programReads({ period: 2, family: testFamily({ family: "idr-v1" }) });
    renderCase("/1/cases/1");
    const element = await settledDispute();
    expect(element).toHaveAttribute("data-arbitrable", TEST_ARBITRABLE);
    expect(element).toHaveAttribute("data-family", "idr-v1");
    expect(element).toHaveAttribute("data-compatibility", "full");
    expect(element).toHaveAttribute("data-period", "2");
    expect(element).toHaveAttribute("data-last-period-change", testFoundLookup().dispute.lastPeriodChange.toString());
    expect(element).toHaveAttribute("data-reality-notice", "none");
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(await screen.findByTestId("case-title")).toHaveTextContent("Dispute 1 title");
  });

  it("S-4: the header renders from the lookup while the meta-evidence still loads", async () => {
    programReads({ period: 1, metaEvidence: { "1": "pending" } });
    renderCase("/1/cases/1");
    await waitFor(() => {
      expect(page()).toHaveAttribute("data-period", "1");
    });
    expect(page()).toHaveAttribute("data-state", "dispute");
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(screen.queryByTestId("case-title")).not.toBeInTheDocument();
    expect(page()).not.toHaveAttribute("data-compatibility");
  });
});

describe("compatibility banner (spec 5.5)", () => {
  it("spec 5.5: a view-only dispute shows the 'View mode only' banner", async () => {
    programReads({ family: GOVERNOR });
    renderCase("/1/cases/1");
    await waitFor(() => {
      expect(page()).toHaveAttribute("data-compatibility", "view-only");
    });
    expect(screen.getByTestId("case-compat-banner")).toHaveTextContent("View mode only");
    expect(screen.getByTestId("case-compat-banner")).toHaveTextContent("You can't submit evidence or fund appeals on this interface.");
  });

  it("spec 5.5: a compatible dispute shows no banner", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    expect(page()).toHaveAttribute("data-compatibility", "full");
    expect(screen.queryByTestId("case-compat-banner")).not.toBeInTheDocument();
  });
});

describe("accordion (spec 5.11)", () => {
  it("spec 5.11: before the appeal period the accordion holds Question and Evidence, all collapsed", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    expect(screen.queryByRole("button", { name: "Appeal" })).not.toBeInTheDocument();
    for (const name of ["Question", "Evidence"]) {
      expect(accordionButton(name)).toHaveAttribute("aria-expanded", "false");
      expect(accordionBody(name)).not.toBeVisible();
    }
  });

  it("spec 5.11: from the appeal period the Appeal panel comes first", async () => {
    programReads({ period: 3 });
    renderCase("/1/cases/1");
    await settledDispute();
    const titles = screen.getAllByRole("button", { expanded: false }).map((button) => button.textContent);
    expect(titles.slice(0, 3)).toEqual(["Appeal", "Question", "Evidence"]);
    await waitFor(() => {
      expect(screen.getByTestId("appeal-panel")).toHaveAttribute("data-kind", "crowdfunding");
    });
  });

  it("spec 5.11: one panel is open at a time, and a collapsed body stays mounted but hidden", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    const user = userEvent.setup();
    await user.click(accordionButton("Question"));
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(accordionBody("Question")).toBeVisible();
    });
    expect(within(accordionBody("Question")).getByText("Multiple choice: single select")).toBeInTheDocument();
    await user.click(accordionButton("Evidence"));
    await waitFor(() => {
      expect(accordionBody("Evidence")).toBeVisible();
    });
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(accordionBody("Question")).not.toBeVisible();
    });
    expect(screen.getByTestId("case-ruling-options")).toBeInTheDocument();
  });
});

describe("search box (spec 5.2, D-53)", () => {
  it("spec 5.2: the label links Court to the shown dispute on Court", async () => {
    renderCase("/100/cases/7");
    expect(screen.getByRole("search", { name: "Search Disputes on Court" })).toBeInTheDocument();
    expect(screen.getByTestId("link-court")).toHaveAttribute("href", "https://court.kleros.io/cases/7?requiredChainId=100");
    expect(screen.getByTestId("link-court")).toHaveAttribute("target", "_blank");
    await waitFor(() => {
      expect(page()).toHaveAttribute("data-state", "not-found");
    });
  });

  it("D-53: a search clears the shown dispute at once and loads the new ID after the debounce", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    const view = renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByTestId("case-title")).toHaveTextContent("Dispute 1 title");

    await search("2");
    expect(page()).toHaveAttribute("data-state", "loading");
    expect(screen.queryByTestId("case-title")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dispute #1" })).not.toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 2n);

    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/cases/2");
    }, SEARCH_WAIT);
    expect(await screen.findByTestId("case-title")).toHaveTextContent("Dispute 2 title");
    expect(screen.getByTestId("link-court")).toHaveAttribute("href", "https://court.kleros.io/cases/2?requiredChainId=1");
  });

  it("D-53: searching a nonexistent ID while a dispute is shown shows the not-found state", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    await search("99");
    await waitFor(() => {
      expect(page()).toHaveAttribute("data-state", "not-found");
    }, SEARCH_WAIT);
    expect(screen.getByRole("heading", { name: "Dispute with ID 99 does not exist on this network." })).toBeInTheDocument();
    expect(screen.queryByTestId("case-title")).not.toBeInTheDocument();
  });

  it("D-09: clearing the search goes to the case page without an ID", async () => {
    const view = renderCase("/1/cases/1");
    await settledDispute();
    await search("");
    expect(page()).toHaveAttribute("data-state", "no-id");
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/cases");
    }, SEARCH_WAIT);
    expect(screen.getByTestId("link-court")).toHaveAttribute("href", "https://court.kleros.io/cases/0?requiredChainId=1");
  });

  it("spec 5.2: Enter loads the typed ID without waiting for the debounce", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    const view = renderCase("/1/cases/1");
    await settledDispute();
    await search("2");
    await userEvent.setup().keyboard("{Enter}");
    expect(view.currentPath()).toBe("/1/cases/2");
  });

  it("spec 5.11: a new dispute starts with the accordion collapsed", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    renderCase("/1/cases/1");
    await settledDispute();
    await userEvent.setup().click(accordionButton("Question"));
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    await search("2");
    await waitFor(() => {
      expect(screen.getByTestId("link-court")).toHaveAttribute("href", "https://court.kleros.io/cases/2?requiredChainId=1");
    });
    await settledDispute();
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("section degradation (D-36, S-3, D-18)", () => {
  it("D-36: a failed meta-evidence load degrades the summary and the question, and the rest renders", async () => {
    programReads({ metaEvidence: { "1": { status: "failed", reason: "not-json", error: { code: "invalid-data", message: "The meta-evidence file is not JSON." } } } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getByText("Question unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("The meta-evidence file is not JSON.")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-column").length).toBeGreaterThan(0);
    expect(screen.getByTestId("case-court")).toHaveTextContent("General Court");
  });

  it("S-3: a section that throws degrades alone, and its failure does not carry over to the next dispute", async () => {
    // React reports a caught render error to the console and to window; the boundary is what this test checks.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const swallow = (event: ErrorEvent) => {
      event.preventDefault();
    };
    window.addEventListener("error", swallow);
    onTestFinished(() => {
      window.removeEventListener("error", swallow);
    });
    breakRealityNotice = true;
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Reality notice unavailable")).toBeInTheDocument();
    expect(screen.getByText("The data for this section is malformed and cannot be displayed.")).toBeInTheDocument();
    expect(screen.getByTestId("case-title")).toHaveTextContent("Dispute 1 title");

    breakRealityNotice = false;
    await search("2");
    expect(await screen.findByText("Dispute 2 title", undefined, SEARCH_WAIT)).toBeInTheDocument();
    expect(screen.queryByText("Reality notice unavailable")).not.toBeInTheDocument();
  });

  it("D-18: a meta-evidence naming unconfigured chain 10 degrades only the section that needs that chain", async () => {
    const metaEvidence = testMetaEvidence({ arbitrableChainID: { status: "invalid" }, dynamicScriptURI: "/ipfs/QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU/script.js" });
    const params = actualCore.buildScriptParameters({ metaEvidence, arbitratorChainId: 1, disputeId: 1n, arbitrable: TEST_ARBITRABLE, env: {} });
    if (params.ok) throw new Error("chain 10 must not be accepted as a script parameter");
    programReads({ metaEvidence: { "1": { status: "failed", reason: "unknown-chain", error: params.error } } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(params.error.message).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-column").length).toBeGreaterThan(0);
    expect(screen.getByTestId("case-votes")).toHaveAttribute("data-value", "3");
  });

  it("D-18, D-34: an evidence display for chain 10 falls back to the arbitrator chain and the page renders", async () => {
    const metaEvidence = testMetaEvidence({ arbitrableChainID: { status: "invalid" }, evidenceDisplayInterfaceURI: "https://display.example/index.html" });
    programReads({ metaEvidence: { "1": { ...testOkMetaEvidence(), metaEvidence } } });
    renderCase("/1/cases/1");
    await settledDispute();
    const frame = await screen.findByTestId("evidence-display");
    const query = decodeURIComponent(new URL(frame.getAttribute("src") ?? "").search.slice(1));
    expect(JSON.parse(query)).toMatchObject({ arbitrableChainID: 1, arbitratorChainID: 1, chainID: 1 });
    expect(screen.getByTestId("case-title")).toHaveTextContent("Test dispute");
    expect(screen.getAllByTestId("timeline-column").length).toBeGreaterThan(0);
  });
});

describe("network change (spec 5.16, D-55)", () => {
  it("D-55: a chain change loads the same ID on the new chain, with nothing of the old one left", async () => {
    programReads({ lookups: { "5": testFoundLookup({ disputeId: 5n }) } });
    const view = renderCase("/1/cases/5", "/100/cases/5");
    await settledDispute();
    vi.mocked(core.lookupDispute).mockImplementation(() => new Promise<DisputeLookup>(() => undefined));
    await act(async () => {
      await userEvent.setup().click(screen.getByRole("button", { name: "Go to /100/cases/5" }));
    });
    expect(view.currentPath()).toBe("/100/cases/5");
    expect(page()).toHaveAttribute("data-state", "loading");
    expect(screen.queryByTestId("case-title")).not.toBeInTheDocument();
    expect(core.lookupDispute).toHaveBeenLastCalledWith(expect.objectContaining({ chainId: 100 }), 5n);
  });
});
