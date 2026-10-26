import { REGISTRY, buildDisputeView, resolveGateway, type Address, type MetaEvidence, type MetaEvidenceResult } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaseDispute, CoreDeps, SectionData } from "../../data";
import {
  TEST_ARBITRABLE,
  TestDataProvider,
  createTestDeps,
  createTestQueryClient,
  sectionLoading,
  sectionReady,
  sectionUnavailable,
  testCaseDispute,
  testChain,
  testCourt,
  testDetails,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../../test/data";
import { DisputeSummary } from "./index";

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

const MAINNET = testChain(1);

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
  return testCaseDispute({
    lookup: sectionReady(lookup),
    view: options.viewLoading === true ? sectionLoading : sectionReady(view),
    family: sectionReady(testFamily()),
    metaEvidence,
    courts: sectionReady([testCourt()]),
  });
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

/** The case page's Retry of the evidence display, which this file renders without the case page. */
const DISPLAY_RETRY = { key: "display", onRetry: () => undefined };

function renderSummary(dispute: CaseDispute, deps?: CoreDeps, displayRetry = DISPLAY_RETRY, onRetry?: () => void) {
  return renderWithData(<DisputeSummary dispute={dispute} chain={MAINNET} displayRetry={displayRetry} onRetry={onRetry} />, deps);
}

function displayFrame(): HTMLIFrameElement {
  const frame = screen.getByTitle("Evidence display");
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
const APP_LINK = "Go to the arbitrable application";

function expectSummaryTitle(name: string): void {
  expect(screen.getByRole("heading", { level: 2, name }).textContent).toBe(name);
}

describe("DisputeSummary", () => {
  it("shows the title, the markdown description, the parties, the arbitrable-app link and the attachment", () => {
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
    expectSummaryTitle("Is the logo compliant?");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Party 1")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Party 1 address")).toBeInTheDocument();
    expect(screen.getByTitle(party)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: APP_LINK })).toHaveAttribute("href", "https://app.example.org/item/1");
    expect(screen.getByRole("link", { name: "policy.pdf" })).toBeInTheDocument();
  });

  it("the description runs the full width of the card, like the title above it, with its paragraphs set at the long-line height", () => {
    renderSummary(withMetaEvidence({ description: "A description long enough to wrap." }));
    const markdownRoot = screen.getByText("A description long enough to wrap.").parentElement;
    expect(markdownRoot?.className).not.toMatch(/(^|\s)max-w-/);
    expect(markdownRoot).toHaveClass("[&_p]:leading-7");
  });

  it("the attachment links to the gateway URL of fileURI, not to the meta-evidence file", () => {
    renderSummary(withMetaEvidence({ fileURI: `/ipfs/${FILE_CID}/policy.pdf` }));
    const link = screen.getByRole("link", { name: "policy.pdf" });
    expect(link).toHaveAttribute("href", `${GATEWAY}/ipfs/${FILE_CID}/policy.pdf`);
    expect(link).not.toHaveAttribute("href", testOkMetaEvidence().fileUrl);
  });

  it("places the evidence display after the parties and the links in the card's footer", () => {
    const { unmount } = renderSummary(
      withMetaEvidence({
        aliases: { "0x1111111111111111111111111111111111111111": "Alice" },
        arbitrableInterfaceURI: "https://app.example.org/item/1",
        evidenceDisplayInterfaceURI: DISPLAY_URI,
      }),
    );
    const frame = displayFrame();
    const link = screen.getByRole("link", { name: APP_LINK });
    expect(screen.getByText("Party 1").compareDocumentPosition(frame)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(frame.compareDocumentPosition(link)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(link.closest(".border-t")).toHaveClass("bg-klerosUIComponentsLightBackground", "rounded-b-[17px]");
    unmount();

    const { container } = renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }));
    expect(displayFrame()).toBeInTheDocument();
    expect(container.querySelector('[class~="rounded-b-[17px]"]')).toBeNull();
    expect(container.querySelector('[class~="bg-klerosUIComponentsLightBackground"]')).toBeNull();
  });

  it("closes a card with no footer on its own padding below the display, with no line after the display", () => {
    const { container } = renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }));
    const content = displayFrame().closest('[class~="p-4"]');
    expect(content).toHaveClass("p-4", "lg:py-6");
    expect(content?.nextElementSibling).toBeNull();
    expect(container.querySelector('[class~="border-b"]')).toBeNull();
  });

  it("shows no link, attachment or evidence display when the meta-evidence names none", () => {
    const { container } = renderSummary(withMetaEvidence({}));
    expect(screen.queryByText(APP_LINK)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Evidence display")).not.toBeInTheDocument();
    expect(container).toHaveTextContent(/^Interact with the disputeTest dispute$/);
    expect(screen.queryByText(/^Party/)).not.toBeInTheDocument();
  });

  it("an empty title still shows a visible heading", () => {
    renderSummary(withMetaEvidence({ title: "" }));
    expectSummaryTitle("Untitled dispute");
  });

  it("shows the invalid-or-tampered placeholder for a rejected meta-evidence", () => {
    const rejected: MetaEvidenceResult = {
      status: "invalid",
      metaEvidence: testOkMetaEvidence({ title: "Invalid or tampered case data, refuse to arbitrate." }).metaEvidence,
      reason: "uri-not-content-addressed",
    };
    renderSummary(caseDispute({ metaEvidence: sectionReady(rejected) }));
    expectSummaryTitle("Invalid or tampered case data, refuse to arbitrate.");
  });

  it("shows a loading placeholder while the meta-evidence loads", () => {
    renderSummary(caseDispute({ metaEvidence: sectionLoading }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Test dispute")).not.toBeInTheDocument();
  });

  it("a failed meta-evidence shows the summary as unavailable with its reason, and its Retry calls the case page's retry", async () => {
    const failed: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The meta-evidence file could not be fetched." } };
    const onRetry = vi.fn();
    renderSummary(caseDispute({ metaEvidence: sectionReady(failed) }), undefined, DISPLAY_RETRY, onRetry);

    expect(screen.getByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getByText("The meta-evidence file could not be fetched.")).toBeInTheDocument();
    expect(screen.queryByText("Test dispute")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry Dispute summary" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("a dispute without meta-evidence shows the summary as unavailable", () => {
    renderSummary(caseDispute({ metaEvidence: sectionReady({ status: "missing" }) }));
    expect(screen.getByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getByText(/has no meta-evidence/)).toBeInTheDocument();
  });

  it("a meta-evidence read that failed in the data layer shows its reason", () => {
    renderSummary(caseDispute({ metaEvidence: sectionUnavailable("rpc-error", "The meta-evidence locator did not answer.") }));
    expect(screen.getByText("The meta-evidence locator did not answer.")).toBeInTheDocument();
  });

  it("renders nothing for a lookup that found no dispute", () => {
    const dispute = caseDispute({ metaEvidence: sectionUnavailable("not-found", "Dispute with ID 1 does not exist on this network.") });
    const { container } = renderSummary({ ...dispute, view: sectionReady({ exists: false, reason: "not-found" }) });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the summary while the dispute view is still loading", () => {
    renderSummary(caseDispute({ viewLoading: true }));
    expectSummaryTitle("Test dispute");
  });

  it("raw HTML in the description renders as text and a javascript: link has no href", () => {
    const { container } = renderSummary(withMetaEvidence({ description: "<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))" }));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    for (const anchor of container.querySelectorAll("a")) expect(anchor.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("description links open in a new tab with rel, and non-https images do not load", () => {
    const { container } = renderSummary(withMetaEvidence({ description: "[rules](https://kleros.io/rules)\n\n![chart](http://example.org/chart.png)" }));
    const link = screen.getByRole("link", { name: "rules" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector("img")).toBeNull();
  });

  it("every external anchor of the summary opens in a new tab with rel=noopener noreferrer", () => {
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

  it("hides the arbitrable-app link when it points at resolve.kleros.io or at the running app", () => {
    const { unmount } = renderSummary(withMetaEvidence({ arbitrableInterfaceURI: "https://resolve.kleros.io/1/cases/1" }));
    expect(screen.queryByText(APP_LINK)).not.toBeInTheDocument();
    unmount();
    renderSummary(withMetaEvidence({ arbitrableInterfaceURI: `https://${window.location.host}/1/cases/1` }));
    expect(screen.queryByText(APP_LINK)).not.toBeInTheDocument();
  });

  it("keeps a link whose URL only contains resolve.kleros.io outside its host", () => {
    renderSummary(withMetaEvidence({ arbitrableInterfaceURI: "https://app.example.org/?from=resolve.kleros.io" }));
    expect(screen.getByRole("link", { name: APP_LINK })).toHaveAttribute("href", "https://app.example.org/?from=resolve.kleros.io");
  });

  it("a plain http:// arbitrable interface or attachment is never linked", () => {
    renderSummary(withMetaEvidence({ arbitrableInterfaceURI: "http://app.example.org", fileURI: "http://files.example.org/a.pdf" }));
    expect(screen.queryByText(APP_LINK)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("http://files.example.org/a.pdf").tagName).toBe("SPAN");
  });

  it("renders the evidence display over https with allow-scripts only for an arbitrable that is not allowlisted", () => {
    const allowlist: readonly Address[] = REGISTRY.displayAllowlist[1] ?? [];
    expect(allowlist).not.toContain(UNLISTED_ARBITRABLE);
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }, UNLISTED_ARBITRABLE));
    const frame = displayFrame();
    expect(frame.getAttribute("src")).toMatch(new RegExp(`^${GATEWAY}${DISPLAY_URI}\\?`));
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("title");
    expect(frame).not.toHaveAttribute("allow");
  });

  it("gives an allowlisted arbitrable's display the relaxed sandbox and the arbitrator's binding", () => {
    const allowlisted = REGISTRY.displayAllowlist[1]?.[0];
    if (allowlisted === undefined) throw new Error("mainnet has no allowlisted display");
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }, allowlisted));
    expect(displayFrame()).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    expect(displayParams()).toMatchObject({ disputeID: "1", chainID: 1, arbitrableContractAddress: allowlisted, arbitratorChainID: 1, arbitrableChainID: 1 });
  });

  it("a display URL that is not https renders no frame", () => {
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: "javascript:alert(1)" }));
    expect(screen.queryByTitle("Evidence display")).not.toBeInTheDocument();
    expectSummaryTitle("Test dispute");
  });

  it("a display served from the app's own origin never gets allow-same-origin", () => {
    const allowlisted = REGISTRY.displayAllowlist[1]?.[0];
    if (allowlisted === undefined) throw new Error("mainnet has no allowlisted display");
    overrides.appOrigin = "https://display.example.org";
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: "https://display.example.org/index.html" }, allowlisted));
    expect(displayFrame()).toHaveAttribute("sandbox", "allow-scripts");
  });

  it("an absolute https://…/ipfs/<CID> display is served from the configured gateway", () => {
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: `https://ipfs.kleros.io/ipfs/${DISPLAY_CID}/index.html` }));
    expect(displayFrame().getAttribute("src")).toMatch(new RegExp(`^${GATEWAY}/ipfs/${DISPLAY_CID}/index.html\\?`));
  });

  it("passes the chain's read RPC URL to the display", () => {
    const readEnv = MAINNET.readRpcEnv;
    if (readEnv === undefined) throw new Error("mainnet names no read RPC variable");
    const deps = createTestDeps({ env: { [readEnv]: "https://read-rpc.example.org/key" } });
    renderSummary(withMetaEvidence({ evidenceDisplayInterfaceURI: DISPLAY_URI }), deps);
    expect(displayParams()).toMatchObject({
      jsonRpcUrl: "https://read-rpc.example.org/key",
      arbitratorJsonRpcUrl: "https://read-rpc.example.org/key",
      arbitrableJsonRpcUrl: "https://read-rpc.example.org/key",
    });
  });

  it("a display that cannot be built degrades the evidence display only, and its Retry calls the case page's display retry", async () => {
    overrides.failDisplay = true;
    const onRetry = vi.fn();
    // React logs the caught render error and jsdom reports the rethrow; both are expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const silence = (event: ErrorEvent) => {
      event.preventDefault();
    };
    window.addEventListener("error", silence);
    try {
      renderSummary(withMetaEvidence({ title: "Still here", evidenceDisplayInterfaceURI: DISPLAY_URI }), undefined, { key: "display", onRetry });
      expect(screen.getByText("Evidence display unavailable")).toBeInTheDocument();
      expectSummaryTitle("Still here");

      await userEvent.click(screen.getByRole("button", { name: "Retry Evidence display" }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("error", silence);
      vi.restoreAllMocks();
    }
  });
});

describe("the summary replacing its placeholder", () => {
  it("fades the title, the description and the parties in after the placeholder, never the card or the evidence display", () => {
    const loading = caseDispute({ metaEvidence: sectionLoading });
    const ready = caseDispute({
      metaEvidence: sectionReady(testOkMetaEvidence({ description: "The description.", aliases: { [TEST_ARBITRABLE]: "Alice" }, evidenceDisplayInterfaceURI: DISPLAY_URI })),
    });
    const { rerender, client } = renderSummary(loading);
    rerender(
      <TestDataProvider deps={createTestDeps()} client={client}>
        <DisputeSummary dispute={ready} chain={MAINNET} displayRetry={DISPLAY_RETRY} />
      </TestDataProvider>,
    );
    const revealed = Array.from(document.querySelectorAll("[class*='t-reveal-in']"));
    expect(revealed.map((element) => element.tagName.toLowerCase())).toEqual(["header", "div", "div"]);
    expect(revealed[0]).toContainElement(screen.getByRole("heading", { level: 2 }));
    expect(revealed[1]).toHaveTextContent("The description.");
    expect(revealed[2]).toHaveTextContent("Alice");
    for (const element of revealed) expect(element).toHaveClass("motion-reduce:animate-none");
    expect(revealed.some((element) => element.contains(displayFrame()))).toBe(false);
  });

  it("shows a summary that was ready on the first render without motion", () => {
    const { container } = renderSummary(caseDispute());
    expect(container.innerHTML).not.toContain("t-reveal-in");
  });

  it("adds no gap for parties that render nothing", () => {
    renderSummary(withMetaEvidence({ aliases: {} }));
    const heading = screen.getByRole("heading", { level: 2 });
    const empty = heading.closest("section")?.querySelector("div.empty\\:hidden");
    expect(empty).toBeEmptyDOMElement();
  });
});
