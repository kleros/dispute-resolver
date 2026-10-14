import {
  getChain,
  type AttachmentLink,
  type ChainConfig,
  type CanonicalIpfsPath,
  type EvidenceItem,
  type EvidenceList,
  type HiddenEvidenceReason,
  type Period,
} from "@dispute-resolver/core";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseDispute, CaseWriteContext } from "../../data";
import { TEST_UPLOAD_PATH, fakeUploader, type FakeUploader } from "../../test/atlas";
import { TEST_ARBITRABLE, sectionLoading, sectionReady, sectionUnavailable, testFamily, testFoundLookup } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { shortenAddress } from "../../ui";
import { TEST_TX_HASH, createTestWallet, fakeWriteController, testReceipt, type FakeWriteController, type TestWallet } from "../../test/wallet";
import type { UploadResult } from "../../atlas";
import type { WriteStatus } from "../../wallet";
import { EvidenceSection } from "./EvidenceSection";

const writes = vi.hoisted(() => ({ fake: null as FakeWriteController | null }));

vi.mock("../../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../wallet")>();
  return {
    ...actual,
    useWrite: () => {
      if (writes.fake === null) throw new Error("Set writes.fake before rendering.");
      return writes.fake.useWrite();
    },
  };
});

const CHAIN = mainnet();
const SUBMITTER = "0x1111111111111111111111111111111111111111";
const OTHER_SUBMITTER = "0x2222222222222222222222222222222222222222";
const ATTACHMENT_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: testReceipt() };
const SUBMITTED: WriteStatus = { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null };
const NO_HIDDEN: Readonly<Record<HiddenEvidenceReason, number>> = { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 };

function mainnet(): ChainConfig {
  const chain = getChain(1);
  if (chain === undefined) throw new Error("Chain 1 is configured.");
  return chain;
}

/** A promise the test settles by hand. */
function deferred<T>() {
  const control: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    control.resolve = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      control.resolve?.(value);
    },
  };
}

function attachmentLink(name: string): AttachmentLink {
  return { kind: "link", href: `https://cdn.kleros.link/ipfs/${ATTACHMENT_CID}/${name}`, label: name, attachmentKind: "image" };
}

function item(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    title: "Delivery receipt",
    description: "The parcel arrived on time.\nSigned by the courier.",
    submitter: SUBMITTER,
    timestamp: 1_700_000_500,
    blockNumber: 500n,
    transactionHash: TEST_TX_HASH,
    uri: `/ipfs/${ATTACHMENT_CID}/evidence.json`,
    attachment: null,
    ...overrides,
  };
}

function evidenceList(items: readonly EvidenceItem[], hidden: Partial<Record<HiddenEvidenceReason, number>> = {}): EvidenceList {
  const hiddenByReason = { ...NO_HIDDEN, ...hidden };
  return { items, hiddenEvidenceCount: Object.values(hiddenByReason).reduce((sum, count) => sum + count, 0), hiddenByReason };
}

function writeContext(overrides: Partial<CaseWriteContext> = {}): CaseWriteContext {
  const lookup = testFoundLookup();
  return { binding: lookup.binding, family: testFamily(), localId: { kind: "local-id", value: 7n }, override: undefined, appealInfo: null, ...overrides };
}

interface DisputeOptions {
  readonly period?: Period;
  readonly evidence?: CaseDispute["evidence"];
  readonly write?: CaseDispute["write"];
  readonly raisedAt?: number;
}

function caseDispute({ period = 0, evidence = sectionReady(evidenceList([])), write = sectionReady(writeContext()), raisedAt = 1_700_000_000 }: DisputeOptions = {}): CaseDispute {
  const lookup = testFoundLookup({ period });
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 1n,
    lookup: sectionReady(lookup),
    view: sectionLoading,
    family: sectionReady(testFamily()),
    metaEvidence: sectionLoading,
    disputeEvent: sectionReady({
      status: "found",
      event: { metaEvidenceId: 0n, evidenceGroupId: 1n, blockNumber: 400n, createdAt: raisedAt, transactionHash: TEST_TX_HASH },
    }),
    evidence,
    courts: sectionLoading,
    appealPanel: sectionLoading,
    write,
  };
}

interface RenderOptions extends DisputeOptions {
  readonly uploader?: FakeUploader;
  readonly wallet?: TestWallet;
  readonly connected?: boolean;
}

async function renderSection({ uploader = fakeUploader(), wallet = createTestWallet(), connected = true, ...dispute }: RenderOptions = {}) {
  if (connected) await wallet.connect();
  const view = renderWithProviders(<EvidenceSection dispute={caseDispute(dispute)} chain={CHAIN} />, { wallet, uploader });
  return { ...view, uploader, user: userEvent.setup() };
}

function submitButton() {
  return screen.getByRole("button", { name: /^(Submit|Awaiting Confirmation)$/ });
}

function dialog() {
  return screen.getByRole("dialog", { name: "Submit Evidence" });
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Submit New Evidence" }));
  return dialog();
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, title = "Contract", description = "The signed contract.") {
  const modal = await openModal(user);
  await user.type(within(modal).getByLabelText("Evidence Title"), title);
  await user.type(within(modal).getByLabelText("Evidence Description"), description);
  await user.click(submitButton());
  return modal;
}

function attach(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("The modal has no file input.");
  fireEvent.change(input, { target: { files: [file] } });
}

function pdf(name = "contract.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

let invalidations: unknown[][];

beforeEach(() => {
  writes.fake = fakeWriteController([{ phase: "pending" }, SUBMITTED, MINED]);
  invalidations = [];
  vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(function record(this: QueryClient, filters) {
    invalidations.push([...(filters?.queryKey ?? [])]);
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EvidenceSection: evidence list (spec 5.14)", () => {
  it("spec 5.14: lists valid entries newest first with title, plain-text description, submitter and UTC time", async () => {
    const newer = item({ title: "Second", submitter: OTHER_SUBMITTER, timestamp: 1_700_000_900, transactionHash: "0x02".padEnd(66, "0") as `0x${string}` });
    const older = item({ title: "First", description: "**not markdown**" });
    await renderSection({ evidence: sectionReady(evidenceList([newer, older])) });

    const entries = screen.getAllByTestId("evidence-item");
    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    if (first === undefined || second === undefined) throw new Error("Expected two entries.");
    expect(first).toHaveAttribute("data-submitter", OTHER_SUBMITTER);
    expect(first).toHaveAttribute("data-timestamp", "1700000900");
    expect(screen.getAllByTestId("evidence-title").map((title) => title.textContent)).toEqual(["Second", "First"]);
    expect(screen.getAllByTestId("evidence-description")[1]?.textContent).toBe("**not markdown**");
    expect(within(second).getByText(new Date(1_700_000_500_000).toUTCString())).toBeInTheDocument();
    expect(within(second).getByText(shortenAddress(SUBMITTER))).toBeInTheDocument();
  });

  it("A17: an attachment is a new-tab link with its icon, never rendered inline", async () => {
    await renderSection({ evidence: sectionReady(evidenceList([item({ attachment: attachmentLink("photo.png") })])) });
    const link = screen.getByTestId("evidence-attachment");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", `https://cdn.kleros.link/ipfs/${ATTACHMENT_CID}/photo.png`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const entry = screen.getByTestId("evidence-item");
    expect(entry.querySelector("img, video, audio, iframe, object, embed")).toBeNull();
  });

  it("D-32: an attachment that is not a safe link is shown as text", async () => {
    await renderSection({ evidence: sectionReady(evidenceList([item({ attachment: { kind: "text", text: "http://example.com/a.pdf" } })])) });
    const attachment = screen.getByTestId("evidence-attachment");
    expect(attachment.tagName).toBe("SPAN");
    expect(attachment).toHaveTextContent("http://example.com/a.pdf");
  });

  it("D-22: shows how many entries were hidden and why", async () => {
    await renderSection({ evidence: sectionReady(evidenceList([item()], { "not-content-addressed": 2 })) });
    const hidden = screen.getByTestId("evidence-hidden-count");
    expect(hidden).toHaveAttribute("data-count", "2");
    expect(hidden).toBeVisible();
    expect(hidden).toHaveTextContent("2 evidence items hidden: not content-addressed");
  });

  it("D-22: labels an undecodable log among other reasons", async () => {
    await renderSection({ evidence: sectionReady(evidenceList([], { undecodable: 1, "fetch-failed": 1 })) });
    expect(screen.getByTestId("evidence-hidden-count")).toHaveTextContent("2 evidence items hidden: 1 undecodable event log, 1 could not be fetched");
  });

  it("D-22: the hidden count is 0 and invisible when nothing is hidden", async () => {
    await renderSection({ evidence: sectionReady(evidenceList([item()])) });
    const hidden = screen.getByTestId("evidence-hidden-count");
    expect(hidden).toHaveAttribute("data-count", "0");
    expect(hidden).not.toBeVisible();
  });

  it("spec 5.14: an empty evidence array shows 'No evidence submitted yet.' and no 'Dispute Raised'", async () => {
    await renderSection();
    expect(screen.getByText("No evidence submitted yet.")).toBeInTheDocument();
    expect(screen.queryByText("Dispute Raised")).toBeNull();
  });

  it("spec 5.14: 'Dispute Raised' shows the Dispute event's time below the entries, even when every entry is hidden", async () => {
    await renderSection({ evidence: sectionReady(evidenceList([], { "schema-invalid": 1 })), raisedAt: 1_700_000_000 });
    expect(screen.getByText("Dispute Raised")).toBeInTheDocument();
    expect(screen.getByText(new Date(1_700_000_000_000).toUTCString())).toBeInTheDocument();
    expect(screen.queryByText("No evidence submitted yet.")).toBeNull();
  });

  it("D-36: the list shows a skeleton while loading", async () => {
    await renderSection({ evidence: sectionLoading });
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("S-5: a missing Dispute event degrades the list only, and submission stays available", async () => {
    await renderSection({ evidence: sectionUnavailable("not-found", "The Dispute event of this dispute was not found.") });
    expect(screen.getByText("Evidence unavailable")).toBeInTheDocument();
    expect(screen.getByText("The Dispute event of this dispute was not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit New Evidence" })).toBeEnabled();
  });

  it("S-5: Retry reads the Dispute event and the evidence again", async () => {
    const { user } = await renderSection({ evidence: sectionUnavailable("rpc-error") });
    await user.click(screen.getByRole("button", { name: "Retry Evidence" }));
    expect(invalidations).toEqual(
      expect.arrayContaining([
        ["dr", "disputeEvent", 1, "1", TEST_ARBITRABLE],
        ["dr", "evidence", 1, "1"],
      ]),
    );
  });
});

describe("EvidenceSection: submit control (spec 5.14)", () => {
  it("spec 5.14: no submit control in the execution period", async () => {
    await renderSection({ period: 4 });
    expect(screen.queryByRole("button", { name: /Submit New Evidence|Go to Arbitrable Application/ })).toBeNull();
  });

  it("spec 5.14: a view-only arbitrable gets the disabled 'Go to Arbitrable Application' button", async () => {
    const family = testFamily({ family: "view-only", capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } } });
    await renderSection({ write: sectionReady(writeContext({ family })) });
    expect(screen.getByRole("button", { name: "Go to Arbitrable Application to Submit Evidence" })).toBeDisabled();
  });

  it("CE-2, D-36: a failed write context read shows 'Evidence submission unavailable' with the reason, not view-only", async () => {
    await renderSection({ write: sectionUnavailable("rpc-error", "The RPC request timed out.") });
    expect(screen.getByText("Evidence submission unavailable")).toBeInTheDocument();
    expect(screen.getByText("The RPC request timed out.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to Arbitrable Application to Submit Evidence" })).toBeNull();
    expect(screen.queryByText("This arbitrable contract does not accept evidence through the Dispute Resolver.")).toBeNull();
  });

  it("CE-2, D-36: Retry reads the family and the dispute details again", async () => {
    const { user } = await renderSection({ write: sectionUnavailable("rpc-error") });
    await user.click(screen.getByRole("button", { name: "Retry Evidence submission" }));
    expect(invalidations).toEqual(
      expect.arrayContaining([
        ["dr", "family", 1, TEST_ARBITRABLE],
        ["dr", "details", 1, "1"],
      ]),
    );
  });

  it("D-52: no sign-in control and no signature before the first upload action", async () => {
    const uploader = fakeUploader({ isSignedIn: false });
    const { user } = await renderSection({ uploader });
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
    const modal = await openModal(user);
    expect(modal).toBeInTheDocument();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
  });

  it("spec 5.14: Return closes the modal", async () => {
    const { user } = await renderSection();
    const modal = await openModal(user);
    await user.click(within(modal).getByRole("button", { name: "Return" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("EvidenceSection: submission (spec 5.14)", () => {
  it("A16, A22: uploads evidence.json with role policy, then calls submitEvidence(localId, uri) on the arbitrated contract", async () => {
    const { user, uploader } = await renderSection();
    await fillAndSubmit(user, "Contract", "The signed contract.");
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    expect(uploader.uploadJson).toHaveBeenCalledWith("evidence.json", { name: "Contract", description: "The signed contract.", fileURI: "", evidenceSide: 0 }, "policy");
    const [execution] = writes.fake?.executions ?? [];
    expect(execution?.options.pageChainId).toBe(1);
    const build = execution?.builds[0];
    expect(build?.ok).toBe(true);
    if (build?.ok !== true) return;
    expect(build.call).toMatchObject({ address: TEST_ARBITRABLE, chainId: 1, functionName: "submitEvidence", args: [7n, TEST_UPLOAD_PATH], value: 0n });
  });

  it("spec 5.14: a governor with submitEvidence(string) gets the URI only", async () => {
    const family = testFamily({
      family: "governor",
      capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
    });
    const { user } = await renderSection({ write: sectionReady(writeContext({ family, localId: { kind: "not-applicable" } })) });
    await fillAndSubmit(user);
    await waitFor(() => {
      expect(writes.fake?.executions).toHaveLength(1);
    });
    const build = writes.fake?.executions[0]?.builds[0];
    if (build?.ok !== true) throw new Error("Expected a built call.");
    expect(build.call).toMatchObject({ functionName: "submitEvidence", args: [TEST_UPLOAD_PATH] });
  });

  it("D-07: refreshes the evidence once the transaction is mined, and reports the success", async () => {
    const { user } = await renderSection();
    await fillAndSubmit(user);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(invalidations).toEqual(
      expect.arrayContaining([
        ["dr", "lookup", 1, "1"],
        ["dr", "evidence", 1, "1"],
      ]),
    );
    expect(screen.getByText("Transaction confirmed")).toBeInTheDocument();
  });

  it("D-44: a mined submission resets every field, the attachment included", async () => {
    const { user, uploader } = await renderSection();
    const modal = await openModal(user);
    await user.type(within(modal).getByLabelText("Evidence Title"), "Photo");
    await user.type(within(modal).getByLabelText("Evidence Description"), "Taken at delivery.");
    attach(pdf());
    await waitFor(() => {
      expect(within(modal).getByText("Uploaded contract.pdf.")).toBeInTheDocument();
    });
    await user.click(submitButton());
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(uploader.uploadJson).toHaveBeenLastCalledWith(
      "evidence.json",
      { name: "Photo", description: "Taken at delivery.", fileURI: TEST_UPLOAD_PATH, evidenceSide: 0 },
      "policy",
    );

    const reopened = await openModal(user);
    expect(within(reopened).getByLabelText("Evidence Title")).toHaveValue("");
    expect(within(reopened).getByLabelText("Evidence Description")).toHaveValue("");
    expect(within(reopened).queryByText("Uploaded contract.pdf.")).toBeNull();
    await user.click(submitButton());
    await waitFor(() => {
      expect(uploader.uploadJson).toHaveBeenCalledTimes(2);
    });
    expect(uploader.uploadJson).toHaveBeenLastCalledWith("evidence.json", { name: "", description: "", fileURI: "", evidenceSide: 0 }, "policy");
  });

  it("WN-2: the attachment path is normalized before it enters evidence.json", async () => {
    const uploader = fakeUploader({ upload: () => Promise.resolve({ ok: true, path: `/ipfs/${ATTACHMENT_CID}/./docs/../contract.pdf/` as CanonicalIpfsPath }) });
    const { user } = await renderSection({ uploader });
    const modal = await openModal(user);
    attach(pdf());
    await waitFor(() => {
      expect(within(modal).getByText("Uploaded contract.pdf.")).toBeInTheDocument();
    });
    await user.click(submitButton());
    await waitFor(() => {
      expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
    });
    expect(uploader.uploadJson.mock.calls[0]?.[1]).toMatchObject({ fileURI: `/ipfs/${ATTACHMENT_CID}/contract.pdf` });
  });

  it("B16: an attachment path that is not content-addressed is refused before anything is uploaded", async () => {
    const uploader = fakeUploader({ upload: () => Promise.resolve({ ok: true, path: "/ipfs/not-a-cid/file.pdf" }) });
    const { user } = await renderSection({ uploader });
    const modal = await openModal(user);
    attach(pdf());
    await waitFor(() => {
      expect(within(modal).getByText("Uploaded contract.pdf.")).toBeInTheDocument();
    });
    await user.click(submitButton());
    expect(await within(modal).findByText("Action unavailable")).toBeInTheDocument();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(writes.fake?.executions).toHaveLength(0);
  });

  it("D-07: a failed submission keeps the modal open with the error and the typed fields", async () => {
    writes.fake = fakeWriteController([{ phase: "pending" }, SUBMITTED, { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "execution reverted" }]);
    const { user } = await renderSection();
    const modal = await fillAndSubmit(user, "Kept");
    expect(await within(modal).findByText("execution reverted")).toBeInTheDocument();
    expect(within(modal).getByRole("alert")).toHaveTextContent("Transaction failed");
    expect(within(modal).getByLabelText("Evidence Title")).toHaveValue("Kept");
    expect(submitButton()).toHaveTextContent("Submit");
    expect(invalidations).toEqual([]);
  });

  it("D-07: a rejected signature is a neutral notice and keeps the modal open", async () => {
    writes.fake = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    const { user } = await renderSection();
    const modal = await fillAndSubmit(user);
    expect(await within(modal).findByText("Transaction cancelled")).toBeInTheDocument();
    expect(within(modal).queryByRole("alert")).toBeNull();
  });

  it("D-07: a failure that arrives after the modal was closed is shown in the panel", async () => {
    const upload = deferred<UploadResult>();
    writes.fake = fakeWriteController([{ phase: "failed", hash: null, explorerUrl: null, message: "wallet error" }]);
    const uploader = fakeUploader({ uploadJson: () => upload.promise });
    const { user } = await renderSection({ uploader });
    const modal = await fillAndSubmit(user);
    await user.click(within(modal).getByRole("button", { name: "Return" }));
    upload.resolve({ ok: true, path: TEST_UPLOAD_PATH });
    expect(await screen.findByText("wallet error")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("D-07: an evidence.json upload failure is shown and nothing is sent", async () => {
    const uploader = fakeUploader({
      uploadJson: () => Promise.resolve({ ok: false, error: "upload-failed", message: "An error occurred while uploading the file. Please try again." }),
    });
    const { user } = await renderSection({ uploader });
    const modal = await fillAndSubmit(user);
    expect(await within(modal).findByText("An error occurred while uploading the file. Please try again.")).toBeInTheDocument();
    expect(within(modal).getByRole("alert")).toHaveTextContent("Evidence not uploaded");
    expect(writes.fake?.executions).toHaveLength(0);
  });

  it("D-52: a declined Atlas sign-in is neutral and nothing is sent", async () => {
    const uploader = fakeUploader({
      isSignedIn: false,
      uploadJson: () => Promise.resolve({ ok: false, error: "sign-in-rejected", message: "Signature declined. Nothing was uploaded." }),
    });
    const { user } = await renderSection({ uploader });
    const modal = await fillAndSubmit(user);
    expect(await within(modal).findByText("Signature declined. Nothing was uploaded.")).toBeInTheDocument();
    expect(within(modal).queryByRole("alert")).toBeNull();
    expect(writes.fake?.executions).toHaveLength(0);
  });

  it("B3, D-48: a wallet on another chain (the load-time switch declined) is refused with the switch offer before anything is uploaded", async () => {
    const { user, uploader } = await renderSection({ wallet: createTestWallet({ chainId: 100, switchChainError: true }) });
    const modal = await fillAndSubmit(user);
    expect(await within(modal).findByText("Wrong network")).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: /^Switch to / })).toBeInTheDocument();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(writes.fake?.executions).toHaveLength(0);
  });

  it("B3: without a wallet the modal offers Connect and nothing is uploaded", async () => {
    const { user, uploader } = await renderSection({ connected: false });
    const modal = await fillAndSubmit(user);
    expect(await within(modal).findByText("Wallet required")).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
  });

  it("spec 5.14: Submit reads 'Awaiting Confirmation' and is disabled while the submission runs", async () => {
    const upload = deferred<UploadResult>();
    const uploader = fakeUploader({ uploadJson: () => upload.promise });
    const { user } = await renderSection({ uploader });
    await fillAndSubmit(user);
    expect(await screen.findByRole("button", { name: "Awaiting Confirmation" })).toBeDisabled();
    upload.resolve({ ok: true, path: TEST_UPLOAD_PATH });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("CE-1, spec 5.14: Submit is disabled while the field's attachment upload runs, before the uploader leaves 'idle'", async () => {
    const upload = deferred<UploadResult>();
    const uploader = fakeUploader({ upload: () => upload.promise });
    const { user } = await renderSection({ uploader });
    const modal = await openModal(user);
    await user.type(within(modal).getByLabelText("Evidence Title"), "Contract");
    attach(pdf());
    expect(await within(modal).findByText("Uploading to IPFS...")).toBeInTheDocument();
    expect(uploader.phase).toBe("idle");
    expect(submitButton()).toBeDisabled();
    upload.resolve({ ok: true, path: TEST_UPLOAD_PATH });
    expect(await within(modal).findByText("Uploaded contract.pdf.")).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it("CE-1, spec 5.14: replacing an attachment keeps Submit disabled until the new upload finishes", async () => {
    const second = deferred<UploadResult>();
    const uploader = fakeUploader();
    uploader.upload.mockResolvedValueOnce({ ok: true, path: TEST_UPLOAD_PATH }).mockReturnValueOnce(second.promise);
    const { user } = await renderSection({ uploader });
    const modal = await openModal(user);
    attach(pdf());
    expect(await within(modal).findByText("Uploaded contract.pdf.")).toBeInTheDocument();
    attach(pdf("annex.pdf"));
    expect(await within(modal).findByText("Uploading to IPFS...")).toBeInTheDocument();
    expect(within(modal).queryByText("Uploaded contract.pdf.")).toBeNull();
    expect(submitButton()).toBeDisabled();
    second.resolve({ ok: true, path: TEST_UPLOAD_PATH });
    expect(await within(modal).findByText("Uploaded annex.pdf.")).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it("spec 5.14: Submit is disabled while the uploader signs in or uploads", async () => {
    const { user } = await renderSection({ uploader: fakeUploader({ phase: "uploading" }) });
    await openModal(user);
    expect(submitButton()).toBeDisabled();
  });

  it("D-21: without Atlas the modal explains that evidence cannot be submitted", async () => {
    const { user } = await renderSection({ uploader: fakeUploader({ availability: "unconfigured" }) });
    const modal = await openModal(user);
    expect(submitButton()).toBeDisabled();
    expect(within(modal).getByText("Submission unavailable")).toBeInTheDocument();
  });
});
