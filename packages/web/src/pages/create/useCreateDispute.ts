import {
  buildCreateDisputeCall,
  buildCreatedMetaEvidence,
  disputeIdFromReceipt,
  encodeExtraData,
  numberOfRulingOptions,
  readArbitrationCost,
  type CanonicalIpfsPath,
  type CreateDisputeInput,
  type Outcome,
  type Unavailable,
} from "@dispute-resolver/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAtlasUpload, type UploadError, type UploadResult } from "../../atlas";
import { useCoreDeps } from "../../data";
import { paths, usePageChain } from "../../routing";
import { useToast } from "../../shell";
import { useWrite, type WriteStatus } from "../../wallet";
import { useChainGuard, type GuardStatus } from "./chainGuard";

/** The page opens the new dispute this long after the success toast (spec §4.6). */
export const NAVIGATION_DELAY_MS = 2000;

/** The file name the generated meta-evidence is uploaded under (spec §4.5 step 5). */
export const META_EVIDENCE_FILE_NAME = "metaEvidence.json";

/**
 * Where the create action stands (spec §4.5, §4.6, D-07). `writing` means the write hook's own status is the one to show,
 * from waiting for the wallet to its outcome.
 */
export type CreateActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "blocked"; readonly status: GuardStatus }
  | { readonly kind: "publishing" }
  | { readonly kind: "publish-failed"; readonly error: UploadError; readonly message: string }
  | { readonly kind: "cost-failed"; readonly error: Unavailable }
  | { readonly kind: "writing" }
  | { readonly kind: "created"; readonly disputeId: bigint }
  | { readonly kind: "no-dispute-id" };

export interface CreateDisputeAction {
  readonly state: CreateActionState;
  readonly writeStatus: WriteStatus;
  /**
   * Something is in progress, or the dispute was created and is about to open: Create and Return are disabled. Every
   * other outcome re-enables them, a mined transaction without a dispute ID included (spec §4.6).
   */
  readonly isBusy: boolean;
  create(): Promise<void>;
}

const UNSETTLED_WRITE_PHASES: ReadonlySet<WriteStatus["phase"]> = new Set(["idle", "pending", "submitted", "mined"]);

function isBusy(state: CreateActionState, writeStatus: WriteStatus): boolean {
  switch (state.kind) {
    case "publishing":
    case "created":
      return true;
    case "writing":
      return UNSETTLED_WRITE_PHASES.has(writeStatus.phase);
    case "idle":
    case "no-dispute-id":
    case "blocked":
    case "publish-failed":
    case "cost-failed":
      return false;
  }
}

function uploadFailure(error: unknown): UploadResult {
  return { ok: false, error: "upload-failed", message: error instanceof Error ? error.message : "The upload failed." };
}

/**
 * The Create action (spec §4.5): upload the generated meta-evidence with role `policy` (A16), read the arbitration cost,
 * then `createDispute` through the write hook, and on a mined receipt open the new dispute (spec §4.6). The wallet and
 * its chain are checked before anything is signed, the Atlas sign-in included (B3, D-48); every failure is shown (D-07).
 * The uploaded meta-evidence is reused when the user retries after a refused, rejected or failed transaction, or after
 * a mined one whose receipt had no dispute ID.
 */
export function useCreateDispute(input: CreateDisputeInput): CreateDisputeAction {
  const { chainId, chain } = usePageChain();
  const guard = useChainGuard();
  const uploader = useAtlasUpload();
  const write = useWrite();
  const deps = useCoreDeps();
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<CreateActionState>({ kind: "idle" });
  const published = useRef<CanonicalIpfsPath | null>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    write.reset();
    if (guard !== null) {
      setState({ kind: "blocked", status: guard });
      return;
    }

    setState({ kind: "publishing" });
    let metaEvidenceUri = published.current;
    if (metaEvidenceUri === null) {
      const upload = await uploader.uploadJson(META_EVIDENCE_FILE_NAME, buildCreatedMetaEvidence(input, deps.registry), "policy").catch((error: unknown) => uploadFailure(error));
      if (!upload.ok) {
        setState({ kind: "publish-failed", error: upload.error, message: upload.message });
        return;
      }
      metaEvidenceUri = upload.path;
      published.current = metaEvidenceUri;
    }

    const extraData = encodeExtraData(input.courtId, input.votes);
    const client = deps.getReadClient(chainId);
    const cost: Outcome<bigint> =
      client === undefined ? { ok: false, error: { code: "no-rpc", message: `No RPC is configured for chain ${String(chainId)}.` } } : await readArbitrationCost(client, chain, extraData);
    if (!cost.ok) {
      setState({ kind: "cost-failed", error: cost.error });
      return;
    }

    setState({ kind: "writing" });
    const build = buildCreateDisputeCall({ chain, extraData, metaEvidenceUri, numberOfRulingOptions: numberOfRulingOptions(input), cost: cost.value });
    const outcome = await write.execute(build, { pageChainId: chainId });
    if (outcome.phase !== "mined") return;

    const disputeId = chain.klerosLiquid === undefined ? null : disputeIdFromReceipt(outcome.receipt.logs, chain.klerosLiquid);
    if (disputeId === null) {
      setState({ kind: "no-dispute-id" });
      return;
    }
    toast.show({ variant: "success", title: "Transaction Confirmed", message: `You have successfully created dispute ${disputeId.toString()}!` });
    setState({ kind: "created", disputeId });
  }, [write, guard, chainId, uploader, input, deps, chain, toast]);

  const create = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      await run();
    } finally {
      running.current = false;
    }
  }, [run]);

  const createdId = state.kind === "created" ? state.disputeId : null;
  useEffect(() => {
    if (createdId === null) return undefined;
    const timer = setTimeout(() => {
      void navigate(paths.case(chainId, createdId));
    }, NAVIGATION_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [createdId, chainId, navigate]);

  return { state, writeStatus: write.status, isBusy: isBusy(state, write.status), create };
}
