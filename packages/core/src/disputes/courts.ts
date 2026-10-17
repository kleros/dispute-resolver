import { klerosLiquidAbi, policyRegistryAbi } from "../abi";
import { getChain } from "../chains";
import { describeError, isContractFailure } from "../rpc";
import { policyFetchUrl, resolveGateway } from "../uri";
import type { GatewayOrigin } from "../uri/types";
import type { Address, Fetcher, Outcome, ReadClient } from "../types";
import { fail, succeed } from "./outcome";
import type { Court, CourtsContext } from "./types";

/** Courts probed in parallel per round of the enumeration. */
const COURTS_PER_ROUND = 8;

interface CourtRead {
  readonly id: bigint;
  readonly parent: bigint;
  readonly hiddenVotes: boolean;
  readonly timesPerPeriod: readonly [bigint, bigint, bigint, bigint];
}

/** One court's arbitrator reads, `null` when `getSubcourt(id)` fails in the contract (past the last court). Rejects otherwise. */
async function readCourt(client: ReadClient, arbitrator: Address, id: bigint): Promise<CourtRead | null> {
  const [subcourt, court] = await Promise.allSettled([
    client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "getSubcourt", args: [id] }),
    client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "courts", args: [id] }),
  ]);
  if (subcourt.status === "rejected") {
    if (isContractFailure(subcourt.reason)) return null;
    throw subcourt.reason;
  }
  if (court.status === "rejected") throw court.reason;
  const [, timesPerPeriod] = subcourt.value;
  const [parent, hiddenVotes] = court.value;
  return { id, parent, hiddenVotes, timesPerPeriod };
}

/**
 * Every court, from 0 up to the first whose `getSubcourt` fails in the contract (today's estimate-gas loop, spec 6.1).
 * Courts are probed `COURTS_PER_ROUND` at a time; a transport failure of any court before the end rejects, so the list
 * is never silently truncated (D-19).
 */
async function enumerateCourts(client: ReadClient, arbitrator: Address, signal: AbortSignal | undefined): Promise<CourtRead[]> {
  const courts: CourtRead[] = [];
  for (;;) {
    signal?.throwIfAborted();
    const first = BigInt(courts.length);
    const round = await Promise.allSettled(Array.from({ length: COURTS_PER_ROUND }, (_, offset) => readCourt(client, arbitrator, first + BigInt(offset))));
    for (const result of round) {
      if (result.status === "rejected") throw result.reason;
      if (result.value === null) return courts;
      courts.push(result.value);
    }
  }
}

/** The court name from a policy JSON: its `name` when a string, else `null`. */
function policyName(policy: unknown): string | null {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) return null;
  const name: unknown = (policy as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

/** One court's policy URI and name. Any failure leaves them `null` for this court only (D-19). */
async function readPolicy(
  context: { readonly client: ReadClient; readonly fetcher: Fetcher; readonly gateway: GatewayOrigin; readonly signal: AbortSignal | undefined },
  policyRegistry: Address | undefined,
  id: bigint,
): Promise<{ readonly policyUri: string | null; readonly name: string | null }> {
  if (policyRegistry === undefined) return { policyUri: null, name: null };
  let policyUri: string;
  try {
    policyUri = await context.client.readContract({ address: policyRegistry, abi: policyRegistryAbi, functionName: "policies", args: [id] });
  } catch {
    return { policyUri: null, name: null };
  }
  if (policyUri === "") return { policyUri: null, name: null };
  const url = policyFetchUrl(policyUri, context.gateway);
  if (url === null) return { policyUri, name: null };
  try {
    const response = await context.fetcher(url, { signal: context.signal });
    return { policyUri, name: response.ok ? policyName(await response.json()) : null };
  } catch {
    return { policyUri, name: null };
  }
}

/**
 * The arbitrator's courts with their policy names (spec 6.1, D-19). `courts(i)` and `getSubcourt(i)` are read until the
 * first contract failure; each `policies(i)` JSON is fetched independently through `policyFetchUrl`, and a failing
 * policy only leaves that court's `name` null. A failure of the court reads fails the list.
 */
export async function listCourts(context: CourtsContext): Promise<Outcome<readonly Court[]>> {
  const chain = getChain(context.chainId);
  const arbitrator = chain?.klerosLiquid;
  if (arbitrator === undefined) return fail("unsupported", "This network has no arbitrator.");
  const { client, signal } = context;
  if (client === undefined) return fail("no-rpc", "This network has no read RPC configured.");
  let courts: CourtRead[];
  try {
    courts = await enumerateCourts(client, arbitrator, signal);
  } catch (error) {
    return fail(isContractFailure(error) ? "reverted" : "rpc-error", `Could not read the courts: ${describeError(error)}`);
  }
  const policyContext = { client, fetcher: context.fetcher, gateway: resolveGateway(context.env), signal };
  const policies = await Promise.all(courts.map((court) => readPolicy(policyContext, chain?.policyRegistry, court.id)));
  return succeed(courts.map((court, index) => ({ ...court, policyUri: policies[index]?.policyUri ?? null, name: policies[index]?.name ?? null })));
}
