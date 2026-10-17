import { buildEvidenceDocument, buildSubmitEvidenceCall, checkChainMatch, normalizeIpfsPath, type ChainId } from "@dispute-resolver/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAtlasUpload, type UploadResult, type UploadedFile } from "../../atlas";
import type { NoticeVariant } from "../../ui";
import { useCaseRefresh, type CaseWriteContext } from "../../data";
import { useWallet, useWrite, type WriteStatus } from "../../wallet";

/** The evidence JSON's file name on Atlas (spec 5.14 step 1). */
export const EVIDENCE_FILE_NAME = "evidence.json";

/** What the user typed and attached in the modal. */
export interface EvidenceDraft {
  readonly title: string;
  readonly description: string;
  readonly attachment: UploadedFile | null;
}

type ActiveWriteStatus = Exclude<WriteStatus, { readonly phase: "idle" }>;

/** A refusal of the chain guard, as the write status `WriteStatusNotice` renders with its Connect and Switch offers. */
export type GuardStatus = Extract<WriteStatus, { readonly phase: "needs-wallet" | "wrong-chain" }>;

/** The guard's refusal for a wallet connected on another chain than the page's. */
export type WrongChainStatus = Extract<GuardStatus, { readonly phase: "wrong-chain" }>;

/** A failure outside the write flow: the evidence JSON upload, or an unexpected error. */
export interface SubmissionNotice {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
}

/** What the submission last reported: a status of the write flow, or a notice of its own. */
export type SubmissionFeedback = { readonly kind: "write"; readonly status: ActiveWriteStatus } | { readonly kind: "notice"; readonly notice: SubmissionNotice };

export interface EvidenceSubmission {
  /**
   * The chain guard every signature of the submission passes first (B3, D-48): `null` when the wallet is connected on
   * the page chain, otherwise why not. It covers the Atlas sign-in of the attachment as well as Submit.
   */
  readonly guard: GuardStatus | null;
  /** `null` before the first attempt and after `clear()`. */
  readonly feedback: SubmissionFeedback | null;
  /** From the click until the write's outcome, the evidence JSON upload included. */
  readonly inFlight: boolean;
  /** Resolves `true` once the transaction is mined. */
  readonly submit: (draft: EvidenceDraft) => Promise<boolean>;
  /** Forgets the last outcome; ignored while a submission is in flight. */
  readonly clear: () => void;
}

/** Why the evidence JSON was not uploaded; a declined Atlas sign-in is the user's choice, not an error (D-07, D-52). */
function uploadNotice(failure: Extract<UploadResult, { readonly ok: false }>): SubmissionNotice {
  if (failure.error === "sign-in-rejected") return { variant: "info", title: "Sign-in declined", body: failure.message };
  return { variant: "error", title: "Evidence not uploaded", body: failure.message };
}

function errorText(error: unknown): string {
  return error instanceof Error && /\S/.test(error.message) ? error.message : "An unexpected error stopped the submission.";
}

/**
 * Submits evidence (spec 5.14 "Submit"): the chain guard first (B3, D-48), so nothing is uploaded or signed for a wallet
 * on another chain; then the attachment path is normalized (B16, triage WN-2) into `evidence.json`, uploaded with role
 * `policy` (A16), signing in to Atlas within the same click when needed (D-52); then the family's `submitEvidence` is
 * built by core on the arbitrated contract from the arbitrator (A22) and sent through the write hook. The list refreshes
 * once the transaction is mined (D-07), and every outcome is reported.
 */
export function useEvidenceSubmission(context: CaseWriteContext, pageChainId: ChainId, disputeId: bigint): EvidenceSubmission {
  const write = useWrite();
  const wallet = useWallet();
  const uploader = useAtlasUpload();
  const refresh = useCaseRefresh(pageChainId, disputeId);
  const [local, setLocal] = useState<SubmissionFeedback | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const busy = useRef(false);
  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;
  const guard = useMemo<GuardStatus | null>(() => {
    const match = checkChainMatch(walletChainId, pageChainId);
    if (match.ok) return null;
    return match.reason === "no-wallet" ? { phase: "needs-wallet", pageChainId } : { phase: "wrong-chain", walletChainId: match.walletChainId, pageChainId: match.pageChainId };
  }, [walletChainId, pageChainId]);

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
  return { guard, feedback, inFlight, submit, clear };
}
