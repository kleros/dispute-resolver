import { getAddress } from "viem";
import { buildScriptParameters } from "../../../../packages/core/src/metaEvidence";
import { coerceMetaEvidence } from "../../../../packages/core/src/metaEvidence/schema";
import type { Registry } from "../../../../packages/core/src/registry/types";
import type { Env, Outcome, ScriptParameters } from "../../../../packages/core/src/types";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import { caseKey } from "../cases";
import type { ScriptReference } from "../enumerate/enumerate";
import { buildOldScriptParameters, oldSandboxValue, type OldParametersResult } from "./oldParams";

/**
 * Today's dispute-1621 override (spec 10.5): for network "1" and dispute "1621" the old app runs this script instead
 * of the meta-evidence's `QmdpXX…`. The new app runs the meta-evidence's script (D-25); 04 §5 requires the two outputs
 * to be identical, which justifies deleting the override.
 */
export const OVERRIDE_1621 = { chainId: 1, disputeId: 1621, cid: "Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf" } as const;

/** What a run compares: production against the new app, or, where they run different scripts, the two runners on one script. */
export type RunPurpose = "production-vs-new-app" | "runner-only";

export interface RunPlan {
  /** `<chain>:<dispute>`, with `/runner-only` for the supplementary run. */
  readonly id: string;
  readonly purpose: RunPurpose;
  readonly reference: ScriptReference;
  readonly old: {
    readonly scriptCid: CidPath;
    readonly params: OldParametersResult;
    /** The `sandbox` value of the old frame, `null` when its parameters fail first. */
    readonly sandbox: string | null;
  };
  readonly new: {
    readonly scriptCid: CidPath;
    readonly params: Outcome<ScriptParameters>;
  };
}

/** The script the old app runs for a dispute: the meta-evidence's, or the dispute-1621 override. */
export function oldScriptCid(reference: ScriptReference): CidPath {
  return reference.chainId === OVERRIDE_1621.chainId && reference.disputeId === OVERRIDE_1621.disputeId ? OVERRIDE_1621.cid : reference.cid;
}

/** The new app's parameters for a dispute (core `buildScriptParameters`, B5, D-35), from the meta-evidence's chain-ID fields. */
export function newScriptParameters(reference: ScriptReference, env: Env): Outcome<ScriptParameters> {
  return buildScriptParameters({
    metaEvidence: coerceMetaEvidence({ ...reference.chainIdFields }),
    arbitratorChainId: reference.chainId,
    disputeId: BigInt(reference.disputeId),
    arbitrable: reference.arbitrable,
    env,
  });
}

function planRun(reference: ScriptReference, purpose: RunPurpose, oldCid: CidPath, env: Env, registry: Registry): RunPlan {
  const params = buildOldScriptParameters({
    chainIdFields: reference.chainIdFields,
    chainId: reference.chainId,
    disputeId: reference.disputeId,
    arbitrableChecksummed: getAddress(reference.arbitrable),
    env,
  });
  const key = caseKey(reference.chainId, BigInt(reference.disputeId));
  return {
    id: purpose === "runner-only" ? `${key}/runner-only` : key,
    purpose,
    reference,
    old: { scriptCid: oldCid, params, sandbox: params.ok ? oldSandboxValue(params.params, registry) : null },
    new: { scriptCid: reference.cid, params: newScriptParameters(reference, env) },
  };
}

/**
 * One run per referencing dispute, production against the new app. Where the old app runs another script (the
 * dispute-1621 override), a second run feeds both runners the new app's script, so a difference is attributed to the
 * script or to the runner.
 */
export function planRuns(references: readonly ScriptReference[], env: Env, registry: Registry): RunPlan[] {
  return references.flatMap((reference) => {
    const oldCid = oldScriptCid(reference);
    const main = planRun(reference, "production-vs-new-app", oldCid, env, registry);
    return oldCid === reference.cid ? [main] : [main, planRun(reference, "runner-only", reference.cid, env, registry)];
  });
}
