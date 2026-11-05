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
import { noRpcError, useCoreDeps } from "../../data";
import { paths, usePageChain } from "../../routing";
import { useToast } from "../../shell";
import { useWrite, useWriteAccess, type NeedsWalletGuard, type WriteAccess, type WriteStatus, type WrongChainGuard } from "../../wallet";
import { clearCreateDraft } from "./draftStorage";

const NAVIGATION_DELAY_MS = 2000;

const META_EVIDENCE_FILE_NAME = "metaEvidence.json";

/** `writing` means the write hook's own status is the one to show, from waiting for the wallet to its outcome. */
export type CreateActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "blocked"; readonly status: NeedsWalletGuard | WrongChainGuard }
  | { readonly kind: "publishing" }
  | { readonly kind: "publish-failed"; readonly error: UploadError; readonly message: string }
  | { readonly kind: "cost-failed"; readonly error: Unavailable }
  | { readonly kind: "writing" }
  | { readonly kind: "created"; readonly disputeId: bigint }
  | { readonly kind: "no-dispute-id" };

interface CreateDisputeAction {
  readonly access: WriteAccess;
  readonly state: CreateActionState;
  readonly writeStatus: WriteStatus;
  /** Also true once the dispute is created and about to open; a mined transaction without a dispute ID is not busy. */
  readonly isBusy: boolean;
  create(): Promise<void>;
}

const UNSETTLED_WRITE_PHASES: ReadonlySet<WriteStatus["phase"]> = new Set(["idle", "checking", "pending", "submitted", "mined"]);

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
 * The wallet and its chain are checked before anything is signed, the Atlas sign-in included. The uploaded
 * meta-evidence is reused when the user retries after a refused, rejected or failed transaction, or after a mined one
 * whose receipt had no dispute ID.
 */
export function useCreateDispute(input: CreateDisputeInput): CreateDisputeAction {
  const { chainId, chain } = usePageChain();
  const access = useWriteAccess(chainId);
  const uploader = useAtlasUpload();
  const write = useWrite();
  const deps = useCoreDeps();
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<CreateActionState>({ kind: "idle" });
  const published = useRef<CanonicalIpfsPath | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    write.reset();
    if (access.status !== "ready") {
      setState({ kind: "blocked", status: access.guard });
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
    const cost: Outcome<bigint> = client === undefined ? { ok: false, error: noRpcError(chainId) } : await readArbitrationCost(client, chain, extraData);
    if (!cost.ok) {
      setState({ kind: "cost-failed", error: cost.error });
      return;
    }

    // The layout remounts the page on a chain change, so an upload or cost read that settles after the page is gone
    // still carries the old page chain, which the wallet may well be on: the wallet's own chain guard would pass.
    if (!mounted.current) return;
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
    clearCreateDraft(chainId);
    setState({ kind: "created", disputeId });
  }, [write, access, chainId, uploader, input, deps, chain, toast]);

  const create = useCallback(async () => {
    // The meta-evidence can only be published through Atlas, so without it there is nothing to start.
    if (running.current || uploader.availability === "unconfigured") return;
    running.current = true;
    try {
      await run();
    } finally {
      running.current = false;
    }
  }, [run, uploader.availability]);

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

  return { access, state, writeStatus: write.status, isBusy: isBusy(state, write.status), create };
}
