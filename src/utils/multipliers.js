import { ethers } from "ethers";
import { getContract } from "ethereum/interface";

//Appealable arbitrables don't all share one ABI: some implement getMultipliers(),
//others expose the values individually under different names (e.g. KlerosGovernor), and some are hybrids.
//We resolve each field independently against the known getter names (by priority).
const MULTIPLIER_FIELD_GETTERS = {
  winnerStakeMultiplier: ["winnerStakeMultiplier", "winnerMultiplier"],
  loserStakeMultiplier: ["loserStakeMultiplier", "loserMultiplier"],
  denominator: ["denominator", "MULTIPLIER_DIVISOR", "MULTIPLIER_DENOMINATOR"],
  loserAppealPeriodMultiplier: ["loserAppealPeriodMultiplier"],
};

//Some arbitrables (e.g. PohV2) hardcode the multiplier divisor as a non-public constant
//Normally this value is 10000
const DEFAULT_MULTIPLIER_DIVISOR = 10000n;

const readFirstGetter = async (arbitrableAddress, provider, names) => {
  for (const name of names) {
    try {
      const contract = new ethers.Contract(arbitrableAddress, [`function ${name}() view returns (uint256)`], provider);
      return await contract[name]();
    } catch {
      //Try the next getter name.
    }
  }
  return null;
};

export const resolveAppealMultipliers = async (arbitrableAddress, provider) => {
  //Standard IDisputeResolver
  try {
    const contract = getContract("IDisputeResolver", arbitrableAddress, provider);
    const m = await contract.getMultipliers();
    return {
      winnerStakeMultiplier: m[0],
      loserStakeMultiplier: m[1],
      loserAppealPeriodMultiplier: m[2],
      denominator: m[3],
    };
  } catch {
    //Not IDisputeResolver, try other getters
  }

  const [winnerStakeMultiplier, loserStakeMultiplier, resolvedDenominator] = await Promise.all([
    readFirstGetter(arbitrableAddress, provider, MULTIPLIER_FIELD_GETTERS.winnerStakeMultiplier),
    readFirstGetter(arbitrableAddress, provider, MULTIPLIER_FIELD_GETTERS.loserStakeMultiplier),
    readFirstGetter(arbitrableAddress, provider, MULTIPLIER_FIELD_GETTERS.denominator),
  ]);

  //If the stake multipliers can't be read, do not show wrong information.
  if (winnerStakeMultiplier == null || loserStakeMultiplier == null) {
    console.warn(
      `resolveAppealMultipliers: could not resolve appeal multipliers for arbitrable ${arbitrableAddress}. A new appeal-contract ABI may need to be supported.`,
      { winnerStakeMultiplier, loserStakeMultiplier, denominator: resolvedDenominator }
    );
    return null;
  }

  //If we can get the stake multipliers, but not the divisor, fall back to the Kleros default.
  const denominator = resolvedDenominator ?? DEFAULT_MULTIPLIER_DIVISOR;

  //Some contracts without an explicit loser appeal-period getter, hardcode the loser funding window to half of the appeal period. (e.g. KlerosGovernor)
  const loserAppealPeriodMultiplier =
    (await readFirstGetter(arbitrableAddress, provider, MULTIPLIER_FIELD_GETTERS.loserAppealPeriodMultiplier)) ?? (denominator / 2n);

  return { winnerStakeMultiplier, loserStakeMultiplier, loserAppealPeriodMultiplier, denominator };
};
