import { CHAINS } from "../../../../packages/core/src/chains";
import type { Env } from "../../../../packages/core/src/types";
import type { ScriptReference } from "../enumerate/enumerate";
import type { GateOptions } from "./report";

/**
 * The references a run covers: every one of the run's chains by default; with `disputes`, those disputes; with `cids`,
 * those of the listed scripts; with `maxPerCid`, the newest disputes of each script up to that many. Any restriction
 * makes the run partial.
 */
export function selectReferences(references: readonly ScriptReference[], options: Pick<GateOptions, "chains" | "disputes" | "cids" | "maxPerCid">): ScriptReference[] {
  const { disputes, cids, maxPerCid } = options;
  const wanted = references.filter(
    (reference) =>
      options.chains.includes(reference.chainId) &&
      (disputes === null || disputes.some((key) => key.chainId === reference.chainId && key.disputeId === reference.disputeId)) &&
      (cids === null || cids.some((cid) => reference.cid === cid || reference.cid.startsWith(cid))),
  );
  if (maxPerCid === null) return [...wanted];
  const perCid = new Map<string, ScriptReference[]>();
  for (const reference of wanted) {
    const key = `${String(reference.chainId)}:${reference.cid}`;
    perCid.set(key, [...(perCid.get(key) ?? []), reference]);
  }
  return [...perCid.values()].flatMap((group) => [...group].sort((a, b) => b.disputeId - a.disputeId).slice(0, maxPerCid));
}

/** The RPC variables of every configured chain, read and public (D-35), which the new runner's redirect rules read. */
export function rpcEnvironment(env: Env): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const chain of Object.values(CHAINS)) {
    for (const name of [chain.readRpcEnv, chain.publicRpcEnv]) {
      const value = name === undefined ? undefined : env[name];
      if (name !== undefined && value !== undefined) variables[name] = value;
    }
  }
  return variables;
}

