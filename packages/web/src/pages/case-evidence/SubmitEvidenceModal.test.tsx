import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeUploader } from "../../test/atlas";
import { renderWithProviders } from "../../test/shell";
import { createTestWallet, type TestWallet } from "../../test/wallet";
import type { WriteAccess } from "../../wallet";
import { SubmitEvidenceModal } from "./SubmitEvidenceModal";

const DRAFT = { title: "Contract", description: "The signed contract.", attachment: null };

async function renderModal(access: WriteAccess, wallet: TestWallet, connected: boolean) {
  if (connected) await wallet.connect();
  const uploader = fakeUploader();
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
  it("locks the attachment field and offers the switch when told the wallet is on another chain", async () => {
    const { uploader, modal } = await renderModal(
      { status: "wrong-chain", guard: { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 } },
      createTestWallet({ chainId: 100, switchChainError: true }),
      true,
    );
    attachPdf();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(within(modal).getByText("Wrong network")).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: "Switch to Ethereum Mainnet" })).toBeInTheDocument();
  });

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
});
