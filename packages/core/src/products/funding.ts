import type { ArbitratedBinding } from "../disputes/types";
import { describesBinding } from "../disputes/localId";
import type { FamilyDetection } from "../families/types";
import { fail, succeed } from "../outcome";
import type { Outcome, ReadClient } from "../types";
import { readBinaryProxy } from "./binaryProxy";
import { CURATE_READERS } from "./curate";
import { readPohV1 } from "./pohV1";
import { readPohV2 } from "./pohV2";
import type { ProductReader } from "./proof";

const READERS: readonly ProductReader[] = [readPohV1, readPohV2, ...CURATE_READERS, readBinaryProxy];

const NO_PROOF = "The arbitrable's own funding record does not prove a ruling.";

/** Whether the last round's funding comes from the arbitrable's own record, the Dispute Resolver reading none for it. */
export function readsProductFunding(family: FamilyDetection): boolean {
  return family.family === "view-only" || family.family === "idr-legacy";
}

/**
 * The fully funded rulings of the round the arbitrable's `rule()` used, from its own getters: Proof of Humanity, the
 * Curate lists and the binary proxy, each recognised by its own calls answering for this arbitrator and dispute, never
 * by its address. Every reader runs and exactly one must prove the funding. Any failure, a transport error included, is
 * no proof, so nothing reads as "not this kind", and it carries no node text. Never rejects.
 */
export async function readProductFunding(client: ReadClient, binding: ArbitratedBinding, family: FamilyDetection, signal?: AbortSignal): Promise<Outcome<readonly bigint[]>> {
  if (!readsProductFunding(family) || !describesBinding(binding, family)) return fail("unsupported", NO_PROOF);
  if (signal?.aborted === true) return fail("rpc-error", NO_PROOF);
  const settled = await Promise.allSettled(READERS.map((read) => read(client, binding)));
  const proofs = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const [proof] = proofs;
  return proofs.length === 1 && proof !== undefined ? succeed(proof) : fail("not-found", NO_PROOF);
}
