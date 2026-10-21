import { Button, Modal, TextArea, TextField } from "@kleros/ui-components-library";
import { useMemo, useState } from "react";
import { AtlasFileField, AtlasUploaderProvider, useAtlasUpload, type AtlasUploader } from "../../atlas";
import { Notice } from "../../ui";
import { WriteStatusNotice, useConnectWallet, type NeedsWalletGuard, type WriteAccess } from "../../wallet";
import { SubmissionFeedbackNotice } from "./SubmissionFeedbackNotice";
import type { EvidenceDraft, SubmissionFeedback } from "./useEvidenceSubmission";

const NEEDS_WALLET = "Connect a wallet to submit evidence.";

export interface SubmitEvidenceModalProps {
  readonly isOpen: boolean;
  readonly draft: EvidenceDraft;
  /** Merges a change into the draft; a patch, so an upload that finishes later keeps what was typed meanwhile. */
  readonly onDraftChange: (patch: Partial<EvidenceDraft>) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  /** A submission is in flight: Submit reads "Awaiting Confirmation" and is disabled. */
  readonly submitting: boolean;
  readonly feedback: SubmissionFeedback | null;
  /** Whether the wallet can sign on the page chain now; anything but `ready` locks the attachment field (B3, D-48). */
  readonly access: WriteAccess;
}

/** A refusal the modal already shows from `access`, so the submission's copy of it is not shown twice. */
function isGuardRefusal(feedback: SubmissionFeedback | null): boolean {
  return feedback?.kind === "write" && (feedback.status.phase === "wrong-chain" || feedback.status.phase === "needs-wallet");
}

/** The wallet disconnected while the modal was open: what was typed stays, and Connect is offered when a wallet can connect. */
function WalletNeeded({ guard }: { readonly guard: NeedsWalletGuard }) {
  const connect = useConnectWallet();
  return (
    <div className="flex flex-col gap-2">
      <Notice variant="info" title="Wallet required" body={NEEDS_WALLET} />
      {connect.available ? (
        <Button
          text="Connect"
          small
          className="self-start"
          onPress={() => {
            connect.open(guard.pageChainId);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The uploader with its `upload` counted, so the modal knows when the attachment field has an upload in flight. The
 * uploader's own `phase` stays "idle" until it has the role limits, which can take a refetch, while the field already
 * shows the upload and has cleared the previous attachment (spec 5.14).
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
 * The overlay fades in over 250 ms and out over 150 ms (motion band of contract §9); the library's tailwind-merge replaces
 * its own 100 ms entering and exiting classes with these, and its backdrop blur stays.
 */
const OVERLAY_MOTION = "entering:animate-[fadeIn_250ms_cubic-bezier(0.22,1,0.36,1)] exiting:animate-[fadeOut_150ms_cubic-bezier(0.22,1,0.36,1)]";

/**
 * The "Submit Evidence" modal of spec 5.14: title, a five-row description and an attachment dropzone (role `evidence`,
 * signing in to Atlas within the drop when needed, D-52), with "Return" and "Submit". No field is validated. Submit is
 * disabled while a submission or an upload runs. With the wallet on another chain the attachment field is locked and the
 * switch is offered under it, so no sign-in is requested (B3, D-48); a Submit refused for the same reason adds no second
 * notice. A wallet that disconnects while the modal is open locks the attachment field and Submit as well, and the
 * typed fields stay editable. The overlay, Escape and "Return" close it; a failed submission keeps it open with the
 * outcome (D-07).
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
        {access.status === "wrong-chain" ? <WriteStatusNotice status={access.guard} /> : null}
        {access.status === "needs-wallet" ? <WalletNeeded guard={access.guard} /> : null}
        {unconfigured ? <Notice variant="warning" title="Submission unavailable" body="Evidence is uploaded to IPFS before it is submitted, and uploads are unavailable." /> : null}
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
