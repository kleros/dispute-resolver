import { klerosLiquidAbi, policyRegistryAbi } from "../abi";
import { getChain } from "../chains";
import { isContractFailure, readFailure } from "../rpc";
import { policyFetchUrl, resolveGateway } from "../uri";
import type { GatewayOrigin } from "../uri/types";
import type { Address, Fetcher, Outcome, ReadClient } from "../types";
import { fail, NETWORK_DATA_UNAVAILABLE, succeed } from "./outcome";
import type { Court, CourtsContext } from "./types";

const COURTS_PER_ROUND = 8;

interface CourtRead {
  readonly id: bigint;
  readonly parent: bigint;
  readonly hiddenVotes: boolean;
  readonly timesPerPeriod: readonly [bigint, bigint, bigint, bigint];
}

/** `null` when `getSubcourt(id)` fails in the contract, which marks the end of the court list. */
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

/** A transport failure of any court before the end rejects, so the list is never silently truncated. */
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

function policyName(policy: unknown): string | null {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) return null;
  const name: unknown = (policy as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

/** Any failure leaves the policy fields `null` for this court only. */
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

/** A failing policy only leaves that court's `name` null; a failure of the court reads fails the list. */
export async function listCourts(context: CourtsContext): Promise<Outcome<readonly Court[]>> {
  const chain = getChain(context.chainId);
  const arbitrator = chain?.klerosLiquid;
  if (arbitrator === undefined) return fail("unsupported", "This network has no arbitrator.");
  const { client, signal } = context;
  if (client === undefined) return fail("no-rpc", NETWORK_DATA_UNAVAILABLE);
  let courts: CourtRead[];
  try {
    courts = await enumerateCourts(client, arbitrator, signal);
  } catch (error) {
    return { ok: false, error: readFailure("the courts", error) };
  }
  const policyContext = { client, fetcher: context.fetcher, gateway: resolveGateway(context.env), signal };
  const policies = await Promise.all(courts.map((court) => readPolicy(policyContext, chain?.policyRegistry, court.id)));
  return succeed(courts.map((court, index) => ({ ...court, policyUri: policies[index]?.policyUri ?? null, name: policies[index]?.name ?? null })));
}
