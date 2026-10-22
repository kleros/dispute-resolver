import * as core from "@dispute-resolver/core";
import type { DisputeEventResult, EvidenceList, Outcome } from "@dispute-resolver/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { HttpRequestError, InvalidInputRpcError, RpcRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testCourt, testDetails, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { CasePage } from "./index";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const KEY = "abc123SECRETxyz";
const KEYED_RPC = `https://rpc.example/v2/${KEY}`;
const GET_CODE = { method: "eth_getCode", params: ["0x1111111111111111111111111111111111111111", "latest"] };

const EVIDENCE: EvidenceList = {
  items: [],
  hiddenEvidenceCount: 0,
  hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 },
};
const FOUND_EVENT: Outcome<DisputeEventResult> = {
  ok: true,
  value: { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01" } },
};

/** Dispute 1 on chain 1 in the appeal period, where both the evidence submission and the appeal need the family. */
function programReads(familyFailure: Error): void {
  vi.mocked(core.lookupDispute).mockResolvedValue(testFoundLookup({ period: 3 }));
  vi.mocked(core.detectFamily).mockRejectedValue(familyFailure);
  vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt({ name: "General Court" })] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(testDetails({ status: "found", ...found }, { appealInfo: { ok: true, value: { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } })),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({
    ok: true,
    value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n },
  });
  vi.mocked(core.readRoundFunding).mockImplementation((_context, round) => Promise.resolve({ ok: true, value: { round, contributions: [], fundedRulings: [] } }));
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });
}

function accordionBody(name: string): HTMLElement {
  const body = screen.getAllByRole("region", { hidden: true }).find((candidate) => candidate.getAttribute("aria-label") === name);
  if (body === undefined) throw new Error(`No accordion body labelled ${name}.`);
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no ResizeObserver, which the library accordion uses; this double stubs it with the rest of the browser surface.
  installOfflineAppKitEnvironment();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a family read that fails with the read RPC's own error", () => {
  it.each([
    ["an HTTP failure", new HttpRequestError({ body: GET_CODE, details: "Too Many Requests", status: 429, url: KEYED_RPC }), "HTTP request failed."],
    [
      "a node error",
      new InvalidInputRpcError(new RpcRequestError({ body: GET_CODE, error: { code: -32000, message: "header not found" }, url: KEYED_RPC })),
      "Missing or invalid parameters.",
    ],
  ])("%s shows its short message in the Evidence submission and Appeal sections, never the RPC's key", async (_, failure, shortMessage) => {
    programReads(failure);
    renderWithProviders(
      <Routes>
        <Route path="cases/:id?" element={<CasePage />} />
      </Routes>,
      { path: "/1/cases/1" },
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Evidence" }));
    await waitFor(() => {
      expect(within(accordionBody("Evidence")).getByText("Evidence submission unavailable")).toBeInTheDocument();
    });
    expect(accordionBody("Evidence")).toHaveTextContent(shortMessage);

    await user.click(screen.getByRole("button", { name: "Appeal" }));
    await waitFor(() => {
      expect(within(accordionBody("Appeal")).getByText("Appeal unavailable")).toBeInTheDocument();
    });
    expect(accordionBody("Appeal")).toHaveTextContent(shortMessage);

    expect(document.body.innerHTML.includes(KEY)).toBe(false);
    expect(document.body.innerHTML.includes("rpc.example")).toBe(false);
  });
});
