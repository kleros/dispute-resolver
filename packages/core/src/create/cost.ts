import { klerosLiquidAbi } from "../abi";
import type { ChainConfig } from "../chains/types";
import type { Hex, Outcome, ReadClient } from "../types";
import { fail, readOutcome } from "./outcome";

/**
 * The arbitration cost in wei for `extraData` (spec 4.3): `arbitrationCost(extraData)` on the chain's KlerosLiquid.
 * `unsupported` when the chain has no arbitrator; a failed read is an outcome, never a rejection.
 */
export function readArbitrationCost(client: ReadClient, chain: ChainConfig, extraData: Hex): Promise<Outcome<bigint>> {
  const arbitrator = chain.klerosLiquid;
  if (arbitrator === undefined) return Promise.resolve(fail("unsupported", `${chain.name} has no arbitrator to read an arbitration cost from.`));
  return readOutcome("the arbitration cost", () => client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "arbitrationCost", args: [extraData] }));
}
