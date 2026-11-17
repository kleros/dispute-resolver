import {
  buildCreateDisputeCall,
  buildCreatedMetaEvidence,
  disputeIdFromReceipt,
  encodeExtraData,
  numberOfRulingOptions,
  readArbitrationCost,
  type CanonicalIpfsPath,
  type ChainConfig,
  type CreateDisputeInput,
  type Outcome,
  type Unavailable,
} from "@dispute-resolver/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAtlasUpload, type UploadError, type UploadResult } from "../../atlas";
import { noRpcError, useCoreDeps, type WriteReceipt } from "../../data";
import { paths, usePageChain } from "../../routing";
import { useWrite, useWriteAccess, useWritesInFlight, type WriteAccess, type WriteOutcome, type WriteStatus, type WriteWording } from "../../wallet";
import { clearCreateDraft } from "./draftStorage";

const NAVIGATION_DELAY_MS = 2000;

const META_EVIDENCE_FILE_NAME = "metaEvidence.json";

/** `writing`: the write reports itself in the toasts, from waiting for the wallet to its outcome. */
export type CreateActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "publishing" }
  | { readonly kind: "publish-failed"; readonly error: UploadError; readonly message: string }
  | { readonly kind: "cost-failed"; readonly error: Unavailable }
  | { readonly kind: "writing" }
  | { readonly kind: "created"; readonly disputeId: bigint }
  | { readonly kind: "no-dispute-id" };

interface CreateDisputeAction {
  readonly access: WriteAccess;
  readonly state: CreateActionState;
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
    case "publish-failed":
    case "cost-failed":
      return false;
  }
}

/** `null` on a chain without KlerosLiquid, or when the receipt holds no DisputeCreation log. */
function createdDisputeId(chain: ChainConfig, receipt: WriteReceipt): bigint | null {
  return chain.klerosLiquid === undefined ? null : disputeIdFromReceipt(receipt.logs, chain.klerosLiquid);
}

function minedState(chain: ChainConfig, receipt: WriteReceipt): CreateActionState {
  const disputeId = createdDisputeId(chain, receipt);
  return disputeId === null ? { kind: "no-dispute-id" } : { kind: "created", disputeId };
}

const IDLE: CreateActionState = { kind: "idle" };

/** The toast reports every outcome; a page that did not send the write only needs to know whether it was mined, and with which dispute. */
function settledElsewhere(chain: ChainConfig, outcome: WriteOutcome): CreateActionState | null {
  return outcome.phase === "mined" ? minedState(chain, outcome.receipt) : null;
}

function inFlightKey(chainId: number): string {
  return `create:${String(chainId)}`;
}

/** The dispute number is known only once the receipt is read, inside the write's own chain. */
function createWording(chain: ChainConfig): WriteWording {
  return {
    doing: "creating the dispute",
    done: (receipt) => {
      const id = createdDisputeId(chain, receipt);
      return id === null ? "The transaction was mined." : `Created dispute ${id.toString()}.`;
    },
  };
}

function useOpenWhenCreated(state: CreateActionState | null, chainId: number): void {
  const navigate = useNavigate();
  const createdId = state?.kind === "created" ? state.disputeId : null;
  useEffect(() => {
    if (createdId === null) return undefined;
    const timer = setTimeout(() => {
      void navigate(paths.case(chainId, createdId));
    }, NAVIGATION_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [createdId, chainId, navigate]);
}

interface HeldCreate {
  /** `null` when nothing was in flight at mount, once it settled without being mined (failed, rejected, unconfirmed), or once dismissed. */
  readonly state: CreateActionState | null;
  /** Forgets a transaction mined without a dispute ID, so the next summary starts afresh, as it does after its own. */
  dismiss(): void;
}

/**
 * The create the page chain still has in flight when the page mounts, followed on either step until it settles, since a
 * reopened page starts on the form. A created dispute opens after the same delay as on the page that sent it.
 */
export function useHeldCreate(): HeldCreate {
  const { chainId, chain } = usePageChain();
  const writesInFlight = useWritesInFlight();
  const [heldAtMount] = useState(() => writesInFlight.find(inFlightKey(chainId)));
  const [state, setState] = useState<CreateActionState | null>(heldAtMount === undefined ? null : { kind: "writing" });

  useEffect(() => {
    if (heldAtMount === undefined) return undefined;
    let active = true;
    void heldAtMount.then((outcome) => {
      if (active) setState(settledElsewhere(chain, outcome));
    });
    return () => {
      active = false;
    };
  }, [heldAtMount, chain]);

  useOpenWhenCreated(state, chainId);

  const dismiss = useCallback(() => {
    setState((current) => (current?.kind === "no-dispute-id" ? null : current));
  }, []);
  return useMemo(() => ({ state, dismiss }), [state, dismiss]);
}

function uploadFailure(error: unknown): UploadResult {
  return { ok: false, error: "upload-failed", message: error instanceof Error ? error.message : "The upload failed." };
}

/**
 * The wallet and its chain are checked before anything is signed, the Atlas sign-in included; the summary already shows
 * that guard with its switch, so a refused press adds nothing. The uploaded meta-evidence is reused on every retry from
 * this summary, whatever the last outcome. The write names the created dispute in its own toast, read from the receipt.
 * The write is held per page chain above the routes until it settles; `held` is the page's `useHeldCreate` state, shown
 * until this summary starts a create of its own.
 */
export function useCreateDispute(input: CreateDisputeInput, held: CreateActionState | null): CreateDisputeAction {
  const { chainId, chain } = usePageChain();
  const access = useWriteAccess(chainId);
  const uploader = useAtlasUpload();
  const write = useWrite();
  const deps = useCoreDeps();
  const writesInFlight = useWritesInFlight();
  const [own, setOwn] = useState<CreateActionState | null>(null);
  const state = own ?? held ?? IDLE;
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
      setOwn({ kind: "idle" });
      return;
    }

    setOwn({ kind: "publishing" });
    let metaEvidenceUri = published.current;
    if (metaEvidenceUri === null) {
      const upload = await uploader.uploadJson(META_EVIDENCE_FILE_NAME, buildCreatedMetaEvidence(input, deps.registry), "policy").catch((error: unknown) => uploadFailure(error));
      if (!upload.ok) {
        setOwn({ kind: "publish-failed", error: upload.error, message: upload.message });
        return;
      }
      metaEvidenceUri = upload.path;
      published.current = metaEvidenceUri;
    }

    const extraData = encodeExtraData(input.courtId, input.votes);
    const client = deps.getReadClient(chainId);
    const cost: Outcome<bigint> = client === undefined ? { ok: false, error: noRpcError(chainId) } : await readArbitrationCost(client, chain, extraData);
    if (!cost.ok) {
      setOwn({ kind: "cost-failed", error: cost.error });
      return;
    }

    // The layout remounts the page on a chain change, so an upload or cost read that settles after the page is gone
    // still carries the old page chain, which the wallet may well be on: the wallet's own chain guard would pass.
    if (!mounted.current) return;
    setOwn({ kind: "writing" });
    const build = buildCreateDisputeCall({ chain, extraData, metaEvidenceUri, numberOfRulingOptions: numberOfRulingOptions(input), cost: cost.value });
    const pending = write.execute(build, { pageChainId: chainId, wording: createWording(chain) });
    writesInFlight.hold(inFlightKey(chainId), pending);
    const outcome = await pending;
    if (outcome.phase !== "mined") return;

    const mined = minedState(chain, outcome.receipt);
    if (mined.kind === "created") clearCreateDraft(chainId);
    setOwn(mined);
  }, [write, access, chainId, uploader, input, deps, chain, writesInFlight]);

  const create = useCallback(async () => {
    // The meta-evidence can only be published through Atlas, so without it there is nothing to start.
    if (running.current || writesInFlight.has(inFlightKey(chainId)) || uploader.availability === "unconfigured") return;
    running.current = true;
    try {
      await run();
    } finally {
      running.current = false;
    }
  }, [run, uploader.availability, writesInFlight, chainId]);

  useOpenWhenCreated(own, chainId);

  return { access, state, isBusy: isBusy(state, write.status), create };
}
