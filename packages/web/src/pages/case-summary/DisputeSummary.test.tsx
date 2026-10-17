import {
  REGISTRY,
  buildDisputeView,
  getChain,
  resolveGateway,
  type Address,
  type ChainConfig,
  type ChainId,
  type MetaEvidence,
  type MetaEvidenceResult,
} from "@dispute-resolver/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys, type CaseDispute, type CoreDeps, type SectionData } from "../../data";
import {
  TEST_ARBITRABLE,
  TestDataProvider,
  createTestDeps,
  createTestQueryClient,
  sectionLoading,
  sectionReady,
  sectionUnavailable,
  testCourt,
  testDetails,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../../test/data";
import { CaseOverview, DecisionAlert, DisputeSummary, DisputeTimeline, RealityNotice } from "./index";

/** What the mocked `env` and `safe-content` read, so single tests can move the app origin or break the display builder. */
const overrides = vi.hoisted(() => ({ appOrigin: null as string | null, failDisplay: false }));

vi.mock("../../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env")>();
  return {
    ...actual,
    get APP_CONFIG() {
      return overrides.appOrigin === null ? actual.APP_CONFIG : { ...actual.APP_CONFIG, appOrigin: overrides.appOrigin };
    },
  };
});

vi.mock("../../safe-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../safe-content")>();
  return {
    ...actual,
    buildEvidenceDisplay: (...args: Parameters<typeof actual.buildEvidenceDisplay>) => {
      if (overrides.failDisplay) throw new Error("display builder failed");
      return actual.buildEvidenceDisplay(...args);
    },
  };
});

afterEach(() => {
  overrides.appOrigin = null;
  overrides.failDisplay = false;
});

const GATEWAY = resolveGateway({});
const DISPLAY_CID = "QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh";
const FILE_CID = "QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU";
const UNLISTED_ARBITRABLE: Address = "0x00000000000000000000000000000000000000aa";

function chainConfig(chainId: ChainId): ChainConfig {
  const chain = getChain(chainId);
  if (chain === undefined) throw new Error(`chain ${String(chainId)} is not configured`);
  return chain;
}

const MAINNET = chainConfig(1);

/** A dispute on mainnet whose summary reads `metaEvidence`; the view is built by core from the same inputs. */
function caseDispute(options: { readonly metaEvidence?: SectionData<MetaEvidenceResult>; readonly arbitrable?: Address; readonly viewLoading?: boolean } = {}): CaseDispute {
  const lookup = testFoundLookup({ arbitrable: options.arbitrable ?? TEST_ARBITRABLE, period: 2 });
  const metaEvidence = options.metaEvidence ?? sectionReady(testOkMetaEvidence());
  const view = buildDisputeView({
    lookup,
    reads: testDetails(lookup),
    family: { ok: true, value: testFamily() },
    courts: { ok: true, value: [testCourt()] },
    metaEvidence: metaEvidence.status === "ready" ? metaEvidence.value : null,
    fundedRulings: null,
  });
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 1n,
    lookup: sectionReady(lookup),
    view: options.viewLoading === true ? sectionLoading : sectionReady(view),
    family: sectionReady(testFamily()),
    metaEvidence,
    disputeEvent: sectionLoading,
    evidence: sectionLoading,
    appealDecisions: sectionLoading,
    courts: sectionReady([testCourt()]),
    appealPanel: sectionLoading,
    write: sectionLoading,
  };
}

function withMetaEvidence(fields: Partial<MetaEvidence>, arbitrable?: Address): CaseDispute {
  return caseDispute({ metaEvidence: sectionReady(testOkMetaEvidence(fields)), arbitrable });
}

function renderWithData(ui: ReactElement, deps: CoreDeps = createTestDeps()) {
  const client = createTestQueryClient();
  const result = render(
    <TestDataProvider deps={deps} client={client}>
      {ui}
    </TestDataProvider>,
  );
  return { ...result, client };
}

function renderSummary(dispute: CaseDispute, deps?: CoreDeps) {
  return renderWithData(<DisputeSummary dispute={dispute} chain={MAINNET} />, deps);
}

function displayFrame(): HTMLIFrameElement {
  const frame = screen.getByTestId("evidence-display");
  if (!(frame instanceof HTMLIFrameElement)) throw new Error("the evidence display is not an iframe");
  return frame;
}

/** The parameters of a JSON-encoded (`_v` absent) display `src`. */
function displayParams(): Record<string, unknown> {
  const src = displayFrame().getAttribute("src") ?? "";
  const query = src.slice(src.indexOf("?") + 1);
  return JSON.parse(decodeURIComponent(query)) as Record<string, unknown>;
}

const DISPLAY_URI = `/ipfs/${DISPLAY_CID}/index.html`;

describe("DisputeSummary", () => {
  it("spec 5.6: shows the title, the markdown description, the parties, the arbitrable-app link and the attachment", () => {
    const party: Address = "0x1111111111111111111111111111111111111111";
    renderSummary(
      withMetaEvidence({
        title: "Is the logo compliant?",
        description: "First paragraph with **bold** text.\n\nSecond paragraph.",
        aliases: { [party]: "Alice" },
        arbitrableInterfaceURI: "https://app.example.org/item/1",
        fileURI: `/ipfs/${FILE_CID}/policy.pdf`,
      }),
    );

    expect(screen.getByText("Interact with the dispute")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Is the logo compliant?" })).toBeInTheDocument();
    expect(screen.getByTestId("case-title")).toHaveTextContent("Is the logo compliant?");
    const description = screen.getByTestId("case-description");
    expect(within(description).getByText("bold").tagName).toBe("STRONG");
    expect(description).toHaveTextContent("Second paragraph.");
    expect(screen.getByText("Party 1")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Party 1 address")).toBeInTheDocument();
    expect(screen.getByTitle(party)).toBeInTheDocument();
    expect(screen.getByTestId("link-arbitrable-app")).toHaveAttribute("href", "https://app.example.org/item/1");
    expect(screen.getByTestId("link-meta-evidence-file")).toHaveTextContent("policy.pdf");
  });

  it("spec 5.6: the attachment links to the gateway URL of fileURI, not to the meta-evidence file", () => {
    renderSummary(withMetaEvidence({ fileURI: `/ipfs/${FILE_CID}/policy.pdf` }));
    const link = screen.getByTestId("link-meta-evidence-file");
    expect(link).toHaveAttribute("href", `${GATEWAY}/ipfs/${FILE_CID}/policy.pdf`);
    expect(link).not.toHaveAttribute("href", testOkMetaEvidence().fileUrl);
  });

  it("spec 5.6: shows no link, attachment or evidence display when the meta-evidence names none", () => {
    renderSummary(withMetaEvidence({}));
    expect(screen.queryByTestId("link-arbitrable-app")).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-meta-evidence-file")).not.toBeInTheDocument();
    expect(screen.queryByTestId("evidence-display")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Party/)).not.toBeInTheDocument();
  });

  it("spec 5.6: keeps an empty title as the parity text and still shows a visible heading", () => {
    renderSummary(withMetaEvidence({ title: "" }));
    expect(screen.getByTestId("case-title")).toHaveTextContent(/^$/);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Untitled dispute");
  });

  it("A2: shows the invalid-or-tampered placeholder for a rejected meta-evidence", () => {
    const rejected: MetaEvidenceResult = { status: "invalid", metaEvidence: testOkMetaEvidence({ title: "Invalid or tampered case data, refuse to arbitrate." }).metaEvidence, reason: "uri-not-content-addressed" };
    renderSummary(caseDispute({ metaEvidence: sectionReady(rejected) }));
    expect(screen.getByTestId("case-title")).toHaveTextContent("Invalid or tampered case data, refuse to arbitrate.");
  });

  it("spec 5.4: shows a loading placeholder while the meta-evidence loads", () => {
    renderSummary(caseDispute({ metaEvidence: sectionLoading }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("case-title")).not.toBeInTheDocument();
  });

  it("D-36: a failed meta-evidence shows the summary as unavailable with its reason, and Retry reloads it", async () => {
    const failed: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The meta-evidence file could not be fetched." } };
    const { client } = renderSummary(caseDispute({ metaEvidence: sectionReady(failed) }));
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(screen.getByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getByText("The meta-evidence file could not be fetched.")).toBeInTheDocument();
    expect(screen.queryByTestId("case-title")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry Dispute summary" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.metaEvidence(1, 1n, TEST_ARBITRABLE) });
  });

  it("D-36: a dispute without meta-evidence shows the summary as unavailable", () => {
    renderSummary(caseDispute({ metaEvidence: sectionReady({ status: "missing" }) }));
    expect(screen.getByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getByText(/has no meta-evidence/)).toBeInTheDocument();
  });

  it("D-36: a meta-evidence read that failed in the data layer shows its reason", () => {
    renderSummary(caseDispute({ metaEvidence: sectionUnavailable("rpc-error", "The meta-evidence locator did not answer.") }));
    expect(screen.getByText("The meta-evidence locator did not answer.")).toBeInTheDocument();
  });

  it("D-53: renders nothing for a lookup that found no dispute", () => {
    const dispute = caseDispute({ metaEvidence: sectionUnavailable("not-found", "Dispute with ID 1 does not exist on this network.") });
    const { container } = renderSummary({ ...dispute, view: sectionReady({ exists: false, reason: "not-found" }) });
    expect(container).toBeEmptyDOMElement();
  });

  it("P-20: renders the summary while the dispute view is still loading", () => {
    renderSummary(caseDispute({ viewLoading: true }));
    expect(screen.getByTestId("case-title")).toHaveTextContent("Test dispute");
  });

  it("A11: raw HTML in the description renders as text and a javascript: link has no href", () => {
    renderSummary(withMetaEvidence({ description: '<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))' }));
    const description = screen.getByTestId("case-description");
    expect(description.querySelector("img")).toBeNull();
    expect(description).toHaveTextContent("<img src=x onerror=alert(1)>");
    for (const anchor of description.querySelectorAll("a")) expect(anchor.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("B14, D-31: description links open in a new tab with rel, and non-https images do not load", () => {
    renderSummary(withMetaEvidence({ description: "[rules](https://kleros.io/rules)\n\n![chart](http://example.org/chart.png)" }));
    const description = screen.getByTestId("case-description");
    const link = within(description).getByRole("link", { name: "rules" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(description.querySelector("img")).toBeNull();
  });

  it("A10: every external anchor of the summary opens in a new tab with rel=noopener noreferrer", () => {
    const { container } = renderSummary(
      withMetaEvidence({
        description: "See [the policy](https://kleros.io/policy).",
        aliases: { "0x1111111111111111111111111111111111111111": "Alice" },
        arbitrableInterfaceURI: "https://app.example.org/item/1",
        fileURI: `/ipfs/${FILE_CID}/policy.pdf`,
      }),
    );
    const anchors = container.querySelectorAll("a[href]");
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    for (const anchor of anchors) {
      expect(anchor).toHaveAttribute("target", "_blank");
      expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
      expect(anchor.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("D-28: hides the arbitrable-app link when it points at resolve.kleros.io or at the running app", () => {
    const { unmount } = renderSummary(withMetaEvidence({ arbitrableInterfaceURI: "https://resolve.kleros.io/1/cases/1" }));
    expect(screen.queryByTestId("link-arbitrable-app")).not.toBeInTheDocument();
    unmount();
    renderSummary(withMetaEvidence({ arbitrableInterfaceURI: `https://${window.location.host}/1/cases/1` }));
    expect(screen.queryByTestId("link-arbitrable-app")).not.toBeInTheDocument();
  });

  it("D-28: keeps a link whose URL only contains resolve.kleros.io outside its host", () => {
    renderSummary(withMetaEvidence({ arbitrableInterfaceURI: "https://app.example.org/?from=resolve.kleros.io" }));
    expect(screen.getByTestId("link-arbitrable-app")).toHaveAttribute("href", "https://app.example.org/?from=resolve.kleros.io");
  });

  it("D-32: a plain http:// arbitrable interface or attachment is never linked", () => {
    renderSummary(withMetaEvidence({ arbitrableInterfaceURI: "http://app.example.org", fileURI: "http://files.example.org/a.pdf" }));
    expect(screen.queryByTestId("link-arbitrable-app")).not.toBeInTheDocument();
    const attachment = screen.getByTestId("link-meta-evidence-file");
    expect(attachment.tagName).toBe("SPAN");
    expect(attachment).toHaveTextContent("http://files.example.org/a.pdf");
  });

  it("A8: renders the evidence display over https with allow-scripts only for an arbitrable that is not allowlisted", () => {
    const allowlist: readonly Address[] = REGISTRY.displayAllowlist[1] ?? [];
    expect(allowlist).not.toContain(UNLISTED_ARBITRABLE);
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }, UNLISTED_ARBITRABLE));
    const frame = displayFrame();
    expect(frame.getAttribute("src")).toMatch(new RegExp(`^${GATEWAY}${DISPLAY_URI}\\?`));
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("title");
    expect(frame).not.toHaveAttribute("allow");
  });

  it("A8: gives an allowlisted arbitrable's display the relaxed sandbox and the arbitrator's binding", () => {
    const allowlisted = REGISTRY.displayAllowlist[1]?.[0];
    if (allowlisted === undefined) throw new Error("mainnet has no allowlisted display");
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }, allowlisted));
    expect(displayFrame()).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    expect(displayParams()).toMatchObject({ disputeID: "1", chainID: 1, arbitrableContractAddress: allowlisted, arbitratorChainID: 1, arbitrableChainID: 1 });
  });

  it("A8: a display URL that is not https renders no frame", () => {
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: "javascript:alert(1)" }));
    expect(screen.queryByTestId("evidence-display")).not.toBeInTheDocument();
    expect(screen.getByTestId("case-title")).toBeInTheDocument();
  });

  it("A8: _v other than 0 encodes the display parameters with URLSearchParams", () => {
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI, displayParamsVersion: "1" }));
    const src = new URL(displayFrame().getAttribute("src") ?? "");
    expect(src.searchParams.get("disputeID")).toBe("1");
    expect(src.searchParams.get("arbitrableContractAddress")).toBe(TEST_ARBITRABLE);
  });

  it("C5: a display served from the app's own origin never gets allow-same-origin", () => {
    const allowlisted = REGISTRY.displayAllowlist[1]?.[0];
    if (allowlisted === undefined) throw new Error("mainnet has no allowlisted display");
    overrides.appOrigin = "https://display.example.org";
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: "https://display.example.org/index.html" }, allowlisted));
    expect(displayFrame()).toHaveAttribute("sandbox", "allow-scripts");
  });

  it("D-26: an absolute https://…/ipfs/<CID> display is served from the configured gateway", () => {
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: `https://ipfs.kleros.io/ipfs/${DISPLAY_CID}/index.html` }));
    expect(displayFrame().getAttribute("src")).toMatch(new RegExp(`^${GATEWAY}/ipfs/${DISPLAY_CID}/index.html\\?`));
  });

  it("B6, D-34: a non-integer or unconfigured arbitrableChainID falls back to the page chain", () => {
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI, arbitrableChainID: { status: "invalid" }, arbitratorChainID: { status: "invalid" } }));
    expect(displayParams()).toMatchObject({ arbitrableChainID: 1, arbitratorChainID: 1, chainID: 1 });
  });

  it("D-35: passes the public RPC URLs to the display, never the read RPC", () => {
    const publicEnv = MAINNET.publicRpcEnv;
    const readEnv = MAINNET.readRpcEnv;
    if (publicEnv === undefined || readEnv === undefined) throw new Error("mainnet names no RPC variables");
    const deps = createTestDeps({ env: { [publicEnv]: "https://public-rpc.example.org", [readEnv]: "https://read-rpc.example.org/secret-key" } });
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }), deps);
    expect(displayParams()).toMatchObject({
      jsonRpcUrl: "https://public-rpc.example.org",
      arbitratorJsonRpcUrl: "https://public-rpc.example.org",
      arbitrableJsonRpcUrl: "https://public-rpc.example.org",
    });
    expect(displayFrame().getAttribute("src")).not.toContain("secret-key");
  });

  it("D-36: a display that cannot be built degrades the evidence display only", () => {
    overrides.failDisplay = true;
    // React logs the caught render error and jsdom reports the rethrow; both are expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const silence = (event: ErrorEvent) => {
      event.preventDefault();
    };
    window.addEventListener("error", silence);
    try {
      renderSummary(withMetaEvidence({ title: "Still here", evidenceDisplayInterfaceURI: DISPLAY_URI }));
      expect(screen.getByText("Evidence display unavailable")).toBeInTheDocument();
      expect(screen.getByTestId("case-title")).toHaveTextContent("Still here");
    } finally {
      window.removeEventListener("error", silence);
      vi.restoreAllMocks();
    }
  });
});

describe("D-18: a meta-evidence naming an unconfigured chain", () => {
  it("D-18: arbitrableChainID 10 degrades only the display parameters; every case section still renders", () => {
    // Chain 10 is not in the chain table, so core parses `arbitrableChainID: 10` as `invalid` (metaEvidence/schema).
    const dispute = withMetaEvidence({ title: "Cross-chain question", evidenceDisplayInterfaceURI: DISPLAY_URI, arbitrableChainID: { status: "invalid" } });
    renderWithData(
      <>
        <CaseOverview dispute={dispute} chain={MAINNET} />
        <DisputeSummary dispute={dispute} chain={MAINNET} />
        <DisputeTimeline dispute={dispute} chain={MAINNET} />
        <DecisionAlert dispute={dispute} chain={MAINNET} />
        <RealityNotice dispute={dispute} chain={MAINNET} />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(screen.getByTestId("case-title")).toHaveTextContent("Cross-chain question");
    expect(displayParams()).toMatchObject({ arbitrableChainID: 1 });
    expect(screen.getAllByTestId("timeline-column").length).toBeGreaterThan(0);
    expect(screen.getByTestId("case-decision")).toHaveAttribute("data-kind", "none");
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("D-18: a configured chain without an RPC gives the display no RPC URL for it instead of failing", () => {
    const polygon = chainConfig(137);
    const dispute = withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI, arbitrableChainID: { status: "valid", chainId: polygon.id } });
    renderSummary(dispute, createTestDeps({ env: {} }));
    expect(displayParams()).toMatchObject({ arbitrableChainID: 137, arbitrableJsonRpcUrl: null });
    expect(screen.getByTestId("case-title")).toBeInTheDocument();
  });
});
