import { governorAbi, idrV2Abi, multiplierGetterAbi } from "../abi";
import type { FamilyDetection } from "../families/types";
import { describeError, isContractFailure } from "../rpc";
import type { Address, Outcome, ReadClient } from "../types";
import { fail, succeed } from "./outcome";
import type { Multipliers } from "./types";

type GetterName = (typeof multiplierGetterAbi)[number]["name"];

/** The single getters per field, in the order they are tried: deployed arbitrables name them differently. */
const FIELD_GETTERS = {
  winnerStakeMultiplier: ["winnerStakeMultiplier", "winnerMultiplier"],
  loserStakeMultiplier: ["loserStakeMultiplier", "loserMultiplier"],
  denominator: ["denominator", "MULTIPLIER_DIVISOR", "MULTIPLIER_DENOMINATOR"],
  loserAppealPeriodMultiplier: ["loserAppealPeriodMultiplier"],
} as const satisfies Readonly<Record<Exclude<keyof Multipliers, "sharedMultiplier">, readonly GetterName[]>>;

const UNSUPPORTED = "This arbitrable does not expose all of its appeal multipliers.";

/**
 * KlerosGovernor.sol fixes these: `MULTIPLIER_DIVISOR = 10000` and "The loser must pay during the first half of the
 * appeal period", with no getter for the latter; the recorded governor fixtures confirm both.
 */
function governorFallback(denominator = 10_000n): Pick<Multipliers, "denominator" | "loserAppealPeriodMultiplier"> {
  return { denominator, loserAppealPeriodMultiplier: denominator / 2n };
}

type Fallback = typeof governorFallback;

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

/** `getMultipliers()`, or `null` when the contract fails it. A transport failure is rethrown. */
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

async function readSingleGetters(client: ReadClient, address: Address, fallback?: Fallback): Promise<Outcome<Multipliers>> {
  const [winnerStakeMultiplier, loserStakeMultiplier, denominator, loserAppealPeriodMultiplier] = await Promise.all([
    firstAnswer(client, address, FIELD_GETTERS.winnerStakeMultiplier),
    firstAnswer(client, address, FIELD_GETTERS.loserStakeMultiplier),
    firstAnswer(client, address, FIELD_GETTERS.denominator),
    firstAnswer(client, address, FIELD_GETTERS.loserAppealPeriodMultiplier),
  ]);
  if (winnerStakeMultiplier === null || loserStakeMultiplier === null) return fail("unsupported", UNSUPPORTED);
  if (denominator !== null && loserAppealPeriodMultiplier !== null) {
    return validated({ winnerStakeMultiplier, loserStakeMultiplier, loserAppealPeriodMultiplier, denominator });
  }
  if (fallback === undefined) return fail("unsupported", UNSUPPORTED);
  const fixed = fallback(denominator ?? undefined);
  return validated({
    winnerStakeMultiplier,
    loserStakeMultiplier,
    loserAppealPeriodMultiplier: loserAppealPeriodMultiplier ?? fixed.loserAppealPeriodMultiplier,
    denominator: fixed.denominator,
  });
}

/** A governor's `sharedMultiplier()`, or `undefined` when the contract fails it. A transport failure is rethrown. */
async function readSharedMultiplier(client: ReadClient, address: Address): Promise<bigint | undefined> {
  try {
    return await client.readContract({ address, abi: governorAbi, functionName: "sharedMultiplier" });
  } catch (error) {
    if (!isContractFailure(error)) throw error;
    return undefined;
  }
}

async function readGovernorMultipliers(client: ReadClient, address: Address): Promise<Outcome<Multipliers>> {
  const [multipliers, sharedMultiplier] = await Promise.all([readSingleGetters(client, address, governorFallback), readSharedMultiplier(client, address)]);
  return multipliers.ok && sharedMultiplier !== undefined ? succeed({ ...multipliers.value, sharedMultiplier }) : multipliers;
}

/**
 * The arbitrable's appeal multipliers: `getMultipliers()`, and when the contract fails it, each field through the first
 * single getter that answers; any field no getter answers is `unsupported`. Only a failure of the contract means "try the
 * next getter"; a transport failure is `rpc-error`. Governors have no `getMultipliers()` and go straight to the getters,
 * take a missing denominator and loser appeal-period multiplier from what KlerosGovernor fixes, and also read
 * `sharedMultiplier()`, which they charge every list when the current ruling is 0. A zero denominator is
 * `invalid-data`, so the amounts never divide by zero. Never rejects.
 */
export async function readMultipliers(client: ReadClient, family: FamilyDetection): Promise<Outcome<Multipliers>> {
  const address = family.arbitrable;
  try {
    if (family.capabilities.appeal.kind === "governor") return await readGovernorMultipliers(client, address);
    const struct = await readStruct(client, address);
    return struct === null ? await readSingleGetters(client, address) : validated(struct);
  } catch (error) {
    return fail("rpc-error", `Could not read the appeal multipliers: ${describeError(error, family.chainId)}`);
  }
}
