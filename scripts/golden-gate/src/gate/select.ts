import { CHAINS } from "../../../../packages/core/src/chains";
import type { Env } from "../../../../packages/core/src/types";
import type { ScriptReference } from "../enumerate/enumerate";

/**
 * The references a run covers: every one by default; with `cids`, those of the listed scripts; with `maxPerCid`, the
 * newest disputes of each script up to that many. Either restriction makes the run partial.
 */
export function selectReferences(references: readonly ScriptReference[], cids: readonly string[] | null, maxPerCid: number | null): ScriptReference[] {
  const wanted = cids === null ? references : references.filter((reference) => cids.some((cid) => reference.cid === cid || reference.cid.startsWith(cid)));
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

