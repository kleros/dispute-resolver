import { buildEvidenceDocument, buildSubmitEvidenceCall, normalizeIpfsPath } from "@dispute-resolver/core";
import { useCallback, useRef, useState } from "react";
import { useAtlasUpload, type UploadFailure, type UploadedFile } from "../../atlas";
import type { NoticeVariant } from "../../ui";
import { useCaseRefresh, type CaseWriteContext } from "../../data";
import { useWrite, useWriteAccess, type WriteAccess, type WriteWording } from "../../wallet";

const EVIDENCE_FILE_NAME = "evidence.json";

export const EVIDENCE_WORDING: WriteWording = { doing: "submitting your evidence", done: "Submitted your evidence." };

export interface EvidenceDraft {
  readonly title: string;
  readonly description: string;
  readonly attachment: UploadedFile | null;
}

/**
 * A failure outside the write flow, shown in place: the evidence JSON upload, a declined sign-in, or an unexpected
 * error. The write's own statuses go to the toasts.
 */
export interface SubmissionNotice {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
}

interface EvidenceSubmission {
  /**
   * The chain guard every signature of the submission passes first. It covers the Atlas sign-in of the attachment as
   * well as Submit.
   */
  readonly access: WriteAccess;
  /** `null` before the first attempt, after `clear()`, and whenever the attempt reached the write. */
  readonly notice: SubmissionNotice | null;
  /** From the click until the write's outcome, the evidence JSON upload included. */
  readonly inFlight: boolean;
  /** Resolves `true` once the transaction is mined. */
  readonly submit: (draft: EvidenceDraft) => Promise<boolean>;
  /** Forgets the last outcome; ignored while a submission is in flight. */
  readonly clear: () => void;
}

/** A declined Atlas sign-in is the user's choice, not an error. */
function uploadNotice(failure: UploadFailure): SubmissionNotice {
  if (failure.error === "sign-in-rejected") return { variant: "info", title: "Sign-in declined", body: failure.message };
  return { variant: "error", title: "Evidence not uploaded", body: failure.message };
}

function errorText(error: unknown): string {
  return error instanceof Error && /\S/.test(error.message) ? error.message : "An unexpected error stopped the submission.";
}

/**
 * The chain guard runs first, so nothing is uploaded or signed for a wallet on another chain; the modal already shows
 * that guard with its switch, so a refused press adds nothing. `submitEvidence` is built on the arbitrated contract read
 * from the arbitrator, never from meta-evidence.
 */
export function useEvidenceSubmission(context: CaseWriteContext, pageChainId: number, disputeId: bigint): EvidenceSubmission {
  const write = useWrite();
  const access = useWriteAccess(pageChainId);
  const uploader = useAtlasUpload();
  const refresh = useCaseRefresh(pageChainId, disputeId);
  const [notice, setNotice] = useState<SubmissionNotice | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const busy = useRef(false);
  const ready = access.status === "ready";

  const send = useCallback(
    async (draft: EvidenceDraft): Promise<boolean> => {
      if (!ready) return false;
      const fileUri = draft.attachment === null ? null : normalizeIpfsPath(draft.attachment.path);
      if (draft.attachment !== null && fileUri === null) {
        await write.execute({ ok: false, refusal: "not-content-addressed" }, { pageChainId, wording: EVIDENCE_WORDING });
        return false;
      }
      const document = buildEvidenceDocument({ name: draft.title, description: draft.description, fileUri });
      const uploaded = await uploader.uploadJson(EVIDENCE_FILE_NAME, document, "policy");
      if (!uploaded.ok) {
        setNotice(uploadNotice(uploaded));
        return false;
      }
      const build = buildSubmitEvidenceCall({ binding: context.binding, family: context.family, localId: context.localId, evidenceUri: uploaded.path });
      const outcome = await write.execute(build, { pageChainId, onMined: () => refresh("evidence"), wording: EVIDENCE_WORDING });
      return outcome.phase === "mined";
    },
    [context, pageChainId, ready, refresh, uploader, write],
  );

  const submit = useCallback(
    async (draft: EvidenceDraft): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setInFlight(true);
      setNotice(null);
      try {
        return await send(draft);
      } catch (error) {
        setNotice({ variant: "error", title: "Evidence not submitted", body: errorText(error) });
        return false;
      } finally {
        busy.current = false;
        setInFlight(false);
      }
    },
    [send],
  );

  const clear = useCallback(() => {
    if (busy.current) return;
    setNotice(null);
  }, []);

  return { access, notice, inFlight, submit, clear };
}
