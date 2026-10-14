import { Button, Modal, TextArea, TextField } from "@kleros/ui-components-library";
import { useMemo, useState } from "react";
import { AtlasFileField, AtlasUploaderProvider, useAtlasUpload, type AtlasUploader } from "../../atlas";
import { Notice } from "../../ui";
import { SubmissionFeedbackNotice } from "./SubmissionFeedbackNotice";
import type { EvidenceDraft, SubmissionFeedback } from "./useEvidenceSubmission";

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
 * The "Submit Evidence" modal of spec 5.14: title, a five-row description and an attachment dropzone (role `evidence`,
 * signing in to Atlas within the drop when needed, D-52), with "Return" and "Submit". No field is validated. Submit is
 * disabled while a submission or an upload runs. The overlay, Escape and "Return" close it; a failed submission keeps it
 * open with the outcome (D-07).
 */
export function SubmitEvidenceModal({ isOpen, draft, onDraftChange, onClose, onSubmit, submitting, feedback }: SubmitEvidenceModalProps) {
  const uploader = useAtlasUpload();
  const attachment = useCountedUploads(uploader);
  const unconfigured = uploader.availability === "unconfigured";
  const uploading = attachment.inFlight || uploader.phase !== "idle";
  return (
    <Modal
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Submit Evidence"
      className="h-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[600px] overflow-y-auto"
    >
      <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
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
            isDisabled={submitting}
            onUploaded={(file) => {
              onDraftChange({ attachment: file });
            }}
            onCleared={() => {
              onDraftChange({ attachment: null });
            }}
          />
        </AtlasUploaderProvider>
        {unconfigured ? (
          <Notice variant="warning" title="Submission unavailable" body="Evidence is uploaded to IPFS before it is submitted, and uploads are unavailable on this deployment." />
        ) : null}
        {feedback === null ? null : <SubmissionFeedbackNotice feedback={feedback} />}
        <div className="flex flex-wrap justify-end gap-3">
          <Button text="Return" variant="secondary" onPress={onClose} />
          <Button text={submitting ? "Awaiting Confirmation" : "Submit"} isLoading={submitting} isDisabled={submitting || uploading || unconfigured} onPress={onSubmit} />
        </div>
      </div>
    </Modal>
  );
}
