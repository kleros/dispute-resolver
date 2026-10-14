import { governorAbi, idrV2Abi, multiplierGetterAbi } from "../abi";
import type { FamilyDetection } from "../families/types";
import { describeError, isContractFailure } from "../rpc";
import type { Address, Outcome, ReadClient } from "../types";
import { fail, succeed } from "./outcome";
import type { Multipliers } from "./types";

type GetterName = (typeof multiplierGetterAbi)[number]["name"];

/** The single getters of spec 10.9, per field, in the order they are tried. */
const FIELD_GETTERS = {
  winnerStakeMultiplier: ["winnerStakeMultiplier", "winnerMultiplier"],
  loserStakeMultiplier: ["loserStakeMultiplier", "loserMultiplier"],
  denominator: ["denominator", "MULTIPLIER_DIVISOR", "MULTIPLIER_DENOMINATOR"],
  loserAppealPeriodMultiplier: ["loserAppealPeriodMultiplier"],
} as const satisfies Readonly<Record<Exclude<keyof Multipliers, "sharedMultiplier">, readonly GetterName[]>>;

/** The Kleros default when a contract keeps its divisor private (spec 10.9 item 4). */
const DEFAULT_DENOMINATOR = 10_000n;

/**
 * The value of the first getter in `names` that answers, or `null` when every one fails in the contract (a revert, an
 * invalid opcode, no data from a fallback function). A transport failure is rethrown: it never means "absent".
 */
async function firstAnswer(client: ReadClient, address: Address, names: readonly GetterName[]): Promise<bigint | null> {
  for (const functionName of names) {
    try {
      return await client.readContract({ address, abi: multiplierGetterAbi, functionName });
    } catch (error) {
      if (!isContractFailure(error)) throw error;
    }
  }
  return null;
}

/** `getMultipliers()` (spec 10.9 item 1), or `null` when the contract fails it. A transport failure is rethrown. */
async function readStruct(client: ReadClient, address: Address): Promise<Multipliers | null> {
  try {
    const [winnerStakeMultiplier, loserStakeMultiplier, loserAppealPeriodMultiplier, denominator] = await client.readContract({
      address,
      abi: idrV2Abi,
      functionName: "getMultipliers",
    });
    return { winnerStakeMultiplier, loserStakeMultiplier, loserAppealPeriodMultiplier, denominator };
  } catch (error) {
    if (!isContractFailure(error)) throw error;
    return null;
  }
}

function validated(multipliers: Multipliers): Outcome<Multipliers> {
  if (multipliers.denominator === 0n) return fail("invalid-data", "The arbitrable reports a multiplier denominator of 0.");
  return succeed(multipliers);
}

/** Spec 10.9 items 2 to 5: each field through its own getters, with the denominator and loser-window defaults. */
async function readSingleGetters(client: ReadClient, address: Address): Promise<Outcome<Multipliers>> {
  const [winnerStakeMultiplier, loserStakeMultiplier, denominator, loserAppealPeriodMultiplier] = await Promise.all([
    firstAnswer(client, address, FIELD_GETTERS.winnerStakeMultiplier),
    firstAnswer(client, address, FIELD_GETTERS.loserStakeMultiplier),
    firstAnswer(client, address, FIELD_GETTERS.denominator),
    firstAnswer(client, address, FIELD_GETTERS.loserAppealPeriodMultiplier),
  ]);
  if (winnerStakeMultiplier === null || loserStakeMultiplier === null) {
    return fail("unsupported", "The arbitrable exposes no appeal stake multipliers this interface understands.");
  }
  const resolvedDenominator = denominator ?? DEFAULT_DENOMINATOR;
  return validated({
    winnerStakeMultiplier,
    loserStakeMultiplier,
    loserAppealPeriodMultiplier: loserAppealPeriodMultiplier ?? resolvedDenominator / 2n,
    denominator: resolvedDenominator,
  });
}

/** A governor's `sharedMultiplier()` (P-05), or `undefined` when the contract fails it. A transport failure is rethrown. */
async function readSharedMultiplier(client: ReadClient, address: Address): Promise<bigint | undefined> {
  try {
    return await client.readContract({ address, abi: governorAbi, functionName: "sharedMultiplier" });
  } catch (error) {
    if (!isContractFailure(error)) throw error;
    return undefined;
  }
}

/** A governor's multipliers (D-47): the single getters, plus `sharedMultiplier()` for a tie (P-05). */
async function readGovernorMultipliers(client: ReadClient, address: Address): Promise<Outcome<Multipliers>> {
  const [multipliers, sharedMultiplier] = await Promise.all([readSingleGetters(client, address), readSharedMultiplier(client, address)]);
  return multipliers.ok && sharedMultiplier !== undefined ? succeed({ ...multipliers.value, sharedMultiplier }) : multipliers;
}

/**
 * The arbitrable's appeal multipliers (spec 10.9): `getMultipliers()`, and when the contract fails it, each field through
 * the first single getter that answers. A missing stake multiplier is `unsupported`; a missing denominator is 10000 and a
 * missing loser appeal-period multiplier half the denominator. Only a failure of the contract means "try the next
 * getter"; a transport failure is `rpc-error`. Governors have no `getMultipliers()` and go straight to the getters
 * (D-47), and also read `sharedMultiplier()`, which they charge every list when the current ruling is 0 (P-05). A zero
 * denominator is `invalid-data`, so the amounts never divide by zero (D-36). Never rejects.
 */
export async function readMultipliers(client: ReadClient, family: FamilyDetection): Promise<Outcome<Multipliers>> {
  const address = family.arbitrable;
  try {
    if (family.capabilities.appeal.kind === "governor") return await readGovernorMultipliers(client, address);
    const struct = await readStruct(client, address);
    return struct === null ? await readSingleGetters(client, address) : validated(struct);
  } catch (error) {
    return fail("rpc-error", `Could not read the appeal multipliers: ${describeError(error)}`);
  }
}
