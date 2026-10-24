import type { Address, OngoingDispute } from "@dispute-resolver/core";
import { dehydrate, hashKey, type QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RUNNER_PATH, createIframeScriptRunner } from "../runner";
import { TestDataProvider, createTestDeps, createTestQueryClient, type FetchStub } from "../test/data";
import { SAMPLE_REDIRECTS, createFakeRunnerDocument, type PostedRun } from "../test/runner";
import { useOngoingTitle } from "./ongoingHooks";
import { shouldPersistQuery } from "./persistence";
import { queryKeys } from "./queryKeys";
import type { OngoingTitle, SectionData } from "./types";

// The real meta-evidence pipeline and the real runner host, over frames the test drives: master shared one window
// listener between concurrent scripts, so a dispute could take another's title and keep it in its cache entry.

const LOCATOR = "https://locator.test/meta-evidence";
const GATEWAY = "https://cdn.kleros.link";
const SCRIPT_URI = "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
const TITLE_BEFORE_SCRIPT = "Title before the script";

const DISPUTES: readonly OngoingDispute[] = [901n, 902n].map((id) => ({
  id,
  arbitrated: `0x${id.toString(16).padStart(40, "0")}` as Address,
  period: 1,
  subcourtId: 0n,
  lastPeriodChange: 1_700_000_000,
  countdownTarget: 1_700_086_400,
}));

function metaEvidencePath(dispute: OngoingDispute): string {
  return `/ipfs/QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU/dispute-${dispute.id.toString()}.json`;
}

function responses(): Record<string, FetchStub> {
  const stubs: Record<string, FetchStub> = { [`${GATEWAY}${SCRIPT_URI}`]: { text: "function getMetaEvidence() {}" } };
  for (const dispute of DISPUTES) {
    stubs[`${LOCATOR}?chainId=1&disputeId=${dispute.id.toString()}`] = { json: { metaEvidenceUri: metaEvidencePath(dispute) } };
    stubs[`${GATEWAY}${metaEvidencePath(dispute)}`] = {
      json: {
        title: TITLE_BEFORE_SCRIPT,
        description: "A scripted dispute on the Ongoing list.",
        question: "Which option?",
        rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
        dynamicScriptURI: SCRIPT_URI,
        arbitrableChainID: 1,
      },
    };
  }
  return stubs;
}

function postedDisputeId(run: PostedRun): string {
  return (run.message as { readonly params: { readonly disputeID: string } }).params.disputeID;
}

let unmount: (() => void) | undefined;

afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.body.replaceChildren();
});

/** Renders both titles in one provider, waits until both runner frames exist, then answers the later frame first. */
async function loadBothAnsweredInReverse(): Promise<{ readonly client: QueryClient; readonly titles: () => readonly SectionData<OngoingTitle>[] }> {
  const fake = createFakeRunnerDocument();
  const runner = createIframeScriptRunner({ document: fake.document, runnerUrl: RUNNER_PATH, maxConcurrent: 4, rpcRedirects: SAMPLE_REDIRECTS });
  const deps = createTestDeps({ env: { REACT_APP_METAEVIDENCE_URL: LOCATOR }, responses: responses(), runner });
  const client = createTestQueryClient();
  const wrapper = ({ children }: { readonly children?: ReactNode }) => (
    <TestDataProvider deps={deps} client={client}>
      {children}
    </TestDataProvider>
  );
  const rendered = renderHook(() => DISPUTES.map((dispute) => useOngoingTitle(1, dispute)), { wrapper });
  unmount = rendered.unmount;

  await waitFor(() => {
    expect(fake.frames).toHaveLength(2);
  });
  const runs = fake.frames.map((frame) => frame.load());
  expect(runs.map(postedDisputeId).sort((a, b) => a.localeCompare(b))).toEqual(["901", "902"]);
  for (const run of [...runs].reverse()) {
    run.acknowledge();
    run.reply({ type: "dr-runner/result", value: { title: `Title of ${postedDisputeId(run)}` }, jsonDuplicateKeys: false });
  }
  return { client, titles: () => rendered.result.current };
}

describe("scripted disputes on the Ongoing list", () => {
  it("two scripted disputes loading together each show their own title when the scripts answer in reverse order", async () => {
    const { titles } = await loadBothAnsweredInReverse();
    await waitFor(() => {
      expect(titles()).toEqual([
        { status: "ready", value: { kind: "title", text: "Title of 901" } },
        { status: "ready", value: { kind: "title", text: "Title of 902" } },
      ]);
    });
  });

  it("each scripted dispute's persisted entry holds its own title", async () => {
    const { client, titles } = await loadBothAnsweredInReverse();
    await waitFor(() => {
      expect(titles().map((title) => title.status)).toEqual(["ready", "ready"]);
    });

    const persisted = dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }).queries;
    for (const dispute of DISPUTES) {
      const entry = persisted.find((query) => query.queryHash === hashKey(queryKeys.metaEvidence(1, dispute.id, dispute.arbitrated)));
      expect(entry?.state.data).toMatchObject({ status: "ok", metaEvidence: { title: `Title of ${dispute.id.toString()}` } });
    }
    expect(persisted).toHaveLength(DISPUTES.length);
  });
});
