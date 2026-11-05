import { Button, Modal, TextArea, TextField } from "@kleros/ui-components-library";
import { useMemo, useState } from "react";
import { AtlasFileField, AtlasUploaderProvider, useAtlasUpload, type AtlasUploader } from "../../atlas";
import { Notice } from "../../ui";
import { ConnectButton, WriteStatusNotice, type NeedsWalletGuard, type WriteAccess } from "../../wallet";
import { SubmissionFeedbackNotice } from "./SubmissionFeedbackNotice";
import type { EvidenceDraft, SubmissionFeedback } from "./useEvidenceSubmission";

const NEEDS_WALLET = "Connect a wallet to submit evidence.";

interface SubmitEvidenceModalProps {
  readonly isOpen: boolean;
  readonly draft: EvidenceDraft;
  /** Merges a change into the draft; a patch, so an upload that finishes later keeps what was typed meanwhile. */
  readonly onDraftChange: (patch: Partial<EvidenceDraft>) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly submitting: boolean;
  readonly feedback: SubmissionFeedback | null;
  /** Anything but `ready` locks the attachment field, so no Atlas sign-in is requested off the page chain. */
  readonly access: WriteAccess;
}

/** A refusal the modal already shows from `access`, so the submission's copy of it is not shown twice. */
function isGuardRefusal(feedback: SubmissionFeedback | null): boolean {
  return feedback?.kind === "write" && (feedback.status.phase === "wrong-chain" || feedback.status.phase === "needs-wallet");
}

/** Shown when the wallet disconnects while the modal is open; what was typed stays. */
function WalletNeeded({ guard }: { readonly guard: NeedsWalletGuard }) {
  return (
    <div className="flex flex-col gap-2">
      <Notice variant="info" title="Wallet required" body={NEEDS_WALLET} />
      <ConnectButton chainId={guard.pageChainId} />
    </div>
  );
}

/**
 * The uploader with its `upload` counted, so the modal knows when the attachment field has an upload in flight. The
 * uploader's own `phase` stays "idle" until it has the role limits, which can take a refetch, while the field already
 * shows the upload and has cleared the previous attachment.
 */
function useCountedUploads(uploader: AtlasUploader): { readonly counted: AtlasUploader; readonly inFlight: boolean } {
  const [inFlight, setInFlight] = useState(0);
  const counted = useMemo<AtlasUploader>(
    () => ({
      ...uploader,
      upload: async (file, role) => {
        setInFlight((count) => count + 1);
        try {
          return await uploader.upload(file, role);
        } finally {
          setInFlight((count) => count - 1);
        }
      },
    }),
    [uploader],
  );
  return { counted, inFlight: inFlight > 0 };
}

/**
 * The overlay fades in and out, and the dialog scales up from 0.96 with it and dips back on close; the library's backdrop
 * blur stays. Both are keyframes, not transitions: react-aria waits for the running animations of the overlay and of its
 * Modal child before it unmounts them, and it cancels transitions. The dialog's rules target that Modal child, which the
 * library renders without a class of ours. The overlay names its theme animations as variables because the library's
 * tailwind-merge only replaces its own 100 ms fades with an animate class it recognises, and it does not know theme names.
 */
const OVERLAY_MOTION = [
  "entering:animate-(--animate-t-overlay-in) exiting:animate-(--animate-t-overlay-out)",
  "[&>[data-entering]]:animate-[t-modal-in_var(--modal-open-dur)_var(--modal-ease)_backwards]",
  "[&>[data-exiting]]:animate-[t-modal-out_var(--modal-close-dur)_var(--modal-ease)_forwards]",
].join(" ");

/**
 * No field is validated. With the wallet on another chain the attachment field is locked and the switch is offered under
 * it, so no sign-in is requested; a Submit refused for the same reason adds no second notice. A failed submission keeps
 * the modal open with the outcome.
 */
export function SubmitEvidenceModal({ isOpen, draft, onDraftChange, onClose, onSubmit, submitting, feedback, access }: SubmitEvidenceModalProps) {
  const uploader = useAtlasUpload();
  const attachment = useCountedUploads(uploader);
  const unconfigured = uploader.availability === "unconfigured";
  const uploading = attachment.inFlight || uploader.phase !== "idle";
  const needsWallet = access.status === "needs-wallet";
  const shownFeedback = access.status !== "ready" && isGuardRefusal(feedback) ? null : feedback;
  return (
    <Modal
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Submit Evidence"
      className="h-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[600px] overflow-y-auto"
      modalOverlayClassname={OVERLAY_MOTION}
    >
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <h2 className="font-semibold text-klerosUIComponentsPrimaryText">Submit Evidence</h2>
        <TextField
          label="Evidence Title"
          className="w-full"
          isDisabled={submitting}
          value={draft.title}
          onChange={(title) => {
            onDraftChange({ title });
          }}
        />
        <TextArea
          label="Evidence Description"
          className="w-full"
          isDisabled={submitting}
          value={draft.description}
          inputProps={{ rows: 5, className: "h-auto w-full" }}
          resizeY
          onChange={(description) => {
            onDraftChange({ description });
          }}
        />
        <AtlasUploaderProvider uploader={attachment.counted}>
          <AtlasFileField
            role="evidence"
            label="Attachment (optional)"
            value={draft.attachment}
            isDisabled={submitting || access.status !== "ready"}
            onUploaded={(file) => {
              onDraftChange({ attachment: file });
            }}
            onCleared={() => {
              onDraftChange({ attachment: null });
            }}
          />
        </AtlasUploaderProvider>
        {access.status === "wrong-chain" ? <WriteStatusNotice status={access.guard} beforeAttempt /> : null}
        {access.status === "needs-wallet" ? <WalletNeeded guard={access.guard} /> : null}
        {shownFeedback === null ? null : <SubmissionFeedbackNotice feedback={shownFeedback} />}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-end gap-3 border-t border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button text="Return" variant="secondary" onPress={onClose} />
          <Button
            text={submitting ? "Awaiting Confirmation" : "Submit"}
            isLoading={submitting}
            isDisabled={submitting || uploading || unconfigured || needsWallet}
            onPress={onSubmit}
          />
        </div>
      </div>
    </Modal>
  );
}
