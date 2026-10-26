import { buildEvidenceDocument, buildSubmitEvidenceCall, normalizeIpfsPath } from "@dispute-resolver/core";
import { useCallback, useRef, useState } from "react";
import { useAtlasUpload, type UploadFailure, type UploadedFile } from "../../atlas";
import type { NoticeVariant } from "../../ui";
import { useCaseRefresh, type CaseWriteContext } from "../../data";
import { useWrite, useWriteAccess, type NeedsWalletGuard, type WriteAccess, type WriteStatus, type WrongChainGuard } from "../../wallet";

const EVIDENCE_FILE_NAME = "evidence.json";

export interface EvidenceDraft {
  readonly title: string;
  readonly description: string;
  readonly attachment: UploadedFile | null;
}

type ActiveWriteStatus = Exclude<WriteStatus, { readonly phase: "idle" }>;

/** A refusal of the chain guard, as the write status `WriteStatusNotice` renders with its Connect and Switch offers. */
type GuardStatus = NeedsWalletGuard | WrongChainGuard;

/** A failure outside the write flow: the evidence JSON upload, or an unexpected error. */
interface SubmissionNotice {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
}

export type SubmissionFeedback = { readonly kind: "write"; readonly status: ActiveWriteStatus } | { readonly kind: "notice"; readonly notice: SubmissionNotice };

interface EvidenceSubmission {
  /**
   * The chain guard every signature of the submission passes first. It covers the Atlas sign-in of the attachment as
   * well as Submit.
   */
  readonly access: WriteAccess;
  /** `null` before the first attempt and after `clear()`. */
  readonly feedback: SubmissionFeedback | null;
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
 * The chain guard runs first, so nothing is uploaded or signed for a wallet on another chain. `submitEvidence` is built
 * on the arbitrated contract read from the arbitrator, never from meta-evidence.
 */
export function useEvidenceSubmission(context: CaseWriteContext, pageChainId: number, disputeId: bigint): EvidenceSubmission {
  const write = useWrite();
  const access = useWriteAccess(pageChainId);
  const uploader = useAtlasUpload();
  const refresh = useCaseRefresh(pageChainId, disputeId);
  const [local, setLocal] = useState<SubmissionFeedback | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const busy = useRef(false);
  const guard: GuardStatus | null = access.status === "ready" ? null : access.guard;

  const send = useCallback(
    async (draft: EvidenceDraft): Promise<boolean> => {
      if (guard !== null) {
        setLocal({ kind: "write", status: guard });
        return false;
      }
      const fileUri = draft.attachment === null ? null : normalizeIpfsPath(draft.attachment.path);
      if (draft.attachment !== null && fileUri === null) {
        setLocal({ kind: "write", status: { phase: "refused", refusal: "not-content-addressed" } });
        return false;
      }
      const document = buildEvidenceDocument({ name: draft.title, description: draft.description, fileUri });
      const uploaded = await uploader.uploadJson(EVIDENCE_FILE_NAME, document, "policy");
      if (!uploaded.ok) {
        setLocal({ kind: "notice", notice: uploadNotice(uploaded) });
        return false;
      }
      const build = buildSubmitEvidenceCall({ binding: context.binding, family: context.family, localId: context.localId, evidenceUri: uploaded.path });
      const outcome = await write.execute(build, { pageChainId, onMined: () => refresh("evidence") });
      return outcome.phase === "mined";
    },
    [context, guard, pageChainId, refresh, uploader, write],
  );

  const submit = useCallback(
    async (draft: EvidenceDraft): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setInFlight(true);
      setLocal(null);
      write.reset();
      try {
        return await send(draft);
      } catch (error) {
        setLocal({ kind: "notice", notice: { variant: "error", title: "Evidence not submitted", body: errorText(error) } });
        return false;
      } finally {
        busy.current = false;
        setInFlight(false);
      }
    },
    [send, write],
  );

  const clear = useCallback(() => {
    if (busy.current) return;
    setLocal(null);
    write.reset();
  }, [write]);

  const feedback: SubmissionFeedback | null = local ?? (write.status.phase === "idle" ? null : { kind: "write", status: write.status });
  return { access, feedback, inFlight, submit, clear };
}
