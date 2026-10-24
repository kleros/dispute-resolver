import { getChain, type ChainConfig } from "@dispute-resolver/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CaseDispute } from "../../data";
import { TestDataProvider, sectionLoading } from "../../test/data";
import { DisputeSections } from "./DisputeSections";
import { PendingSearch } from "./PageStates";

function mainnet(): ChainConfig {
  const chain = getChain(1);
  if (chain === undefined) throw new Error("mainnet is not configured");
  return chain;
}

const MAINNET = mainnet();

/** Dispute 1621 on mainnet as `useCase` gives it the moment its lookup starts. */
const LOOKING_UP: CaseDispute = {
  status: "dispute",
  chainId: 1,
  disputeId: 1621n,
  lookup: sectionLoading,
  view: sectionLoading,
  family: sectionLoading,
  metaEvidence: sectionLoading,
  disputeEvent: sectionLoading,
  evidence: sectionLoading,
  appealDecisions: sectionLoading,
  courts: sectionLoading,
  appealPanel: sectionLoading,
  write: sectionLoading,
};

const NO_RETRIES = { key: (scope: string) => scope, retry: () => undefined };

/** An empty `display: contents` element makes no box, so it takes no place in the layout. */
function makesNoBox(node: Node): boolean {
  return node instanceof Element && node.classList.contains("contents") && node.childNodes.length === 0;
}

/** The elements' tags, classes and roles and the text, without IDs or ARIA references, so two renders can be compared. */
function shape(node: Node): unknown {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;
  return [node.tagName, node.getAttribute("class"), node.getAttribute("role"), shapes(node)];
}

function shapes(parent: Node | null): readonly unknown[] {
  return [...(parent?.childNodes ?? [])].filter((node) => !makesNoBox(node)).map(shape);
}

function lookupLoadingPage(): readonly unknown[] {
  const { container, unmount } = render(
    <TestDataProvider>
      <DisputeSections dispute={LOOKING_UP} chain={MAINNET} retries={NO_RETRIES} />
    </TestDataProvider>,
  );
  const page = shapes(container);
  unmount();
  return page;
}

describe("PendingSearch", () => {
  it("renders the same markup as the page the lookup shows while it loads, the dispute's heading and network included", () => {
    const loading = lookupLoadingPage();
    const { container } = render(<PendingSearch disputeId={1621n} chainName={MAINNET.name} />);
    expect(shapes(container.firstElementChild)).toEqual(loading);
  });

  it("holds the heading's place with a placeholder when the typed text is not an ID", () => {
    const { container } = render(<PendingSearch disputeId={null} chainName={MAINNET.name} />);
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector(".animate-loading.h-8")).not.toBeNull();
    expect(container).toHaveTextContent(MAINNET.name);
  });
});
