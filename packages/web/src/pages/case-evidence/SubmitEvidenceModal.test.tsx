import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeUploader, type FakeUploader } from "../../test/atlas";
import { renderWithProviders } from "../../test/shell";
import { createConnectedTestWallet, createTestWallet, type TestWallet } from "../../test/wallet";
import type { WriteAccess } from "../../wallet";
import { SubmitEvidenceModal } from "./SubmitEvidenceModal";

const DRAFT = { title: "Contract", description: "The signed contract.", attachment: null };

async function renderModal(access: WriteAccess, wallet: TestWallet, connected: boolean, uploader: FakeUploader = fakeUploader()) {
  if (connected) await wallet.connect();
  const onSubmit = vi.fn();
  renderWithProviders(
    <SubmitEvidenceModal isOpen draft={DRAFT} onDraftChange={vi.fn()} onClose={vi.fn()} onSubmit={onSubmit} submitting={false} feedback={null} access={access} />,
    { wallet, uploader },
  );
  return { uploader, onSubmit, modal: screen.getByRole("dialog", { name: "Submit Evidence" }) };
}

function attachPdf() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("The modal has no file input.");
  fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })] } });
}

describe("SubmitEvidenceModal", () => {
  it("locks the attachment field and Submit when told no wallet is connected", async () => {
    const wallet = createTestWallet();
    const { uploader, onSubmit, modal } = await renderModal({ status: "needs-wallet", guard: { phase: "needs-wallet", pageChainId: 1 } }, wallet, false);
    attachPdf();
    expect(uploader.upload).not.toHaveBeenCalled();
    const submit = within(modal).getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(modal).getByText("Connect a wallet to submit evidence.")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Evidence Title")).toBeEnabled();
    await userEvent.click(within(modal).getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(1);
  });

  it("without Atlas the modal locks the attachment field and Submit and shows no notice", async () => {
    const { uploader, onSubmit, modal } = await renderModal({ status: "ready" }, createTestWallet(), true, fakeUploader({ availability: "unconfigured", limits: () => null }));
    expect(within(modal).getByRole("button", { name: "Attachment (optional)" })).toBeDisabled();
    attachPdf();
    expect(uploader.upload).not.toHaveBeenCalled();
    const submit = within(modal).getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(modal).not.toHaveTextContent(/unavailable|Drop a file here/i);
    expect(within(modal).getByLabelText("Evidence Title")).toBeEnabled();
  });
});

describe("SubmitEvidenceModal motion", () => {
  /** The library's overlay, the dialog's nearest ancestor drawing the backdrop blur. */
  function overlayOf(modal: HTMLElement): HTMLElement {
    const overlay = modal.closest<HTMLElement>(".backdrop-blur-md");
    if (overlay === null) throw new Error("The dialog has no overlay.");
    return overlay;
  }

  it("fades the overlay in and out with keyframes in place of the library's fades, keeping its blur", async () => {
    const { modal } = await renderModal({ status: "ready" }, createTestWallet(), true);
    const overlay = overlayOf(modal);
    expect(overlay).toHaveClass("entering:animate-(--animate-t-overlay-in)", "exiting:animate-(--animate-t-overlay-out)", "backdrop-blur-md");
    expect(overlay.className).not.toContain("fadeIn");
    expect(overlay.className).not.toContain("fadeOut");
  });

  it("scales the dialog box in on open and back out on close through the overlay's direct child", async () => {
    const { modal } = await renderModal({ status: "ready" }, createTestWallet(), true);
    const overlay = overlayOf(modal);
    expect(overlay).toHaveClass(
      "[&>[data-entering]]:animate-[t-modal-in_var(--modal-open-dur)_var(--modal-ease)_backwards]",
      "[&>[data-exiting]]:animate-[t-modal-out_var(--modal-close-dur)_var(--modal-ease)_forwards]",
    );
    const box = overlay.firstElementChild;
    expect(box).not.toBeNull();
    expect(box?.contains(modal)).toBe(true);
  });

  it("raises an upload's outcome into view, and plays it again for a different outcome", async () => {
    const wallet = await createConnectedTestWallet();
    const notice = (title: string, body: string) => ({ kind: "notice", notice: { variant: "warning", title, body } }) as const;
    const props = { isOpen: true, draft: DRAFT, onDraftChange: vi.fn(), onClose: vi.fn(), onSubmit: vi.fn(), submitting: false, access: { status: "ready" } } as const;
    const { rerender } = renderWithProviders(<SubmitEvidenceModal {...props} feedback={notice("Evidence not uploaded", "First reason.")} />, { wallet });
    const first = screen.getByText("First reason.");
    const alert = first.closest<HTMLElement>("[class*='t-stagger-in']");
    expect(alert).not.toBeNull();
    expect(alert?.className).toContain("motion-reduce:[&_h2]:animate-none");

    rerender(<SubmitEvidenceModal {...props} feedback={notice("Evidence not uploaded", "Second reason.")} />);
    expect(first).not.toBeInTheDocument();
    expect(screen.getByText("Second reason.").closest("[class*='t-stagger-in']")).not.toBeNull();
  });
});
