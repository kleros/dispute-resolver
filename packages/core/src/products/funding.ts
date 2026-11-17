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

/**
 * The products whose verified `fundAppeal` takes the losing side's appeal funding only while `now − start < (end −
 * start) / 2` and the others' until the appeal period ends. The binary proxy finds a dispute only once it is ruled.
 */
const TIMED_READERS: readonly ProductReader[] = [readPohV1, readPohV2, ...CURATE_READERS];

const READERS: readonly ProductReader[] = [...TIMED_READERS, readBinaryProxy];

const NO_PROOF = "The arbitrable's own funding record does not prove a ruling.";

/**
 * What exactly one reader gives, every reader running: none or several is no answer. Any failure, a transport error
 * included, is no answer, so nothing reads as "not this kind". Never rejects.
 */
async function onlyAnswer<T>(readers: readonly ProductReader[], read: (reader: ProductReader) => Promise<T>): Promise<T | undefined> {
  const settled = await Promise.allSettled(readers.map(read));
  const answers = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  return answers.length === 1 ? answers[0] : undefined;
}

/** Whether the last round's funding comes from the arbitrable's own record, the Dispute Resolver reading none for it. */
export function readsProductFunding(family: FamilyDetection): boolean {
  return family.family === "view-only" || family.family === "idr-legacy";
}

/**
 * The fully funded rulings of the round the arbitrable's `rule()` used, from its own getters: Proof of Humanity, the
 * Curate lists and the binary proxy, each recognised by its own calls answering for this arbitrator and dispute, never
 * by its address. Exactly one must prove the funding, and a failure carries no node text. Never rejects.
 */
export async function readProductFunding(client: ReadClient, binding: ArbitratedBinding, family: FamilyDetection, signal?: AbortSignal): Promise<Outcome<readonly bigint[]>> {
  if (!readsProductFunding(family) || !describesBinding(binding, family)) return fail("unsupported", NO_PROOF);
  if (signal?.aborted === true) return fail("rpc-error", NO_PROOF);
  const funded = await onlyAnswer(READERS, async (locate) => (await locate(client, binding))());
  return funded === undefined ? fail("not-found", NO_PROOF) : succeed(funded);
}

/**
 * Whether a view-only arbitrable is Proof of Humanity or a Curate list, by the calls that find the dispute before its
 * funding read, so it answers in the appeal period. Never rejects.
 */
export async function recogniseProduct(client: ReadClient, binding: ArbitratedBinding, family: FamilyDetection, signal?: AbortSignal): Promise<boolean> {
  if (family.family !== "view-only" || !describesBinding(binding, family) || signal?.aborted === true) return false;
  return (await onlyAnswer(TIMED_READERS, (locate) => locate(client, binding))) !== undefined;
}
