import { concat, encodeAbiParameters, hexToBigInt, numberToHex, parseAbi, parseAbiParameters, slice, toFunctionSelector } from "viem";
import type { Hex } from "../types";
import { check, newestFirst, paidSides, rawCall, sameAddress, type ProductReader } from "./proof";

const requestAbi = parseAbi([
  "function getRequestInfo(bytes32, uint256) view returns (bool disputed, uint256 disputeID, uint256, bool, address[3], uint256 numberOfRounds, uint256, address arbitrator)",
  "function getRoundInfo(bytes32, uint256, uint256) view returns (bool, uint256[3], bool[3] hasPaid)",
]);

const DISPUTE_KEY = parseAbiParameters("address, uint256");
const WORD_BYTES = 32;

/** Head word `index` (from 1) of an answer at least that long. */
const headWord = (answer: Hex, index: number): bigint => hexToBigInt(slice(answer, (index - 1) * WORD_BYTES, index * WORD_BYTES));

/**
 * Each list contract's getter from a dispute to its item, and its item getter, whose head word `requestsWord` (from 1)
 * is the number of requests and the word before it the item's status, 0 to 3. The head words before those are offsets
 * of strings and bytes, or an address: never decoded.
 */
const ROWS = [
  { mapping: "arbitratorDisputeIDToTokenID(address,uint256)", info: "getTokenInfo(bytes32)", requestsWord: 6 }, // T2CR ArbitrableTokenList
  { mapping: "arbitratorDisputeIDToItem(address,uint256)", info: "getItemInfo(bytes32)", requestsWord: 3 }, // GeneralizedTCR
  { mapping: "arbitratorDisputeIDToItemID(address,uint256)", info: "getItemInfo(bytes32)", requestsWord: 2 }, // LightGeneralizedTCR
] as const;

/**
 * The Curate lists share `rule()`: the item's newest request then is the disputed one, since no request opens while one
 * is disputed, and later requests are told apart by their dispute. An undisputed request reports dispute 0, so only a
 * disputed one may match.
 */
export const CURATE_READERS: readonly ProductReader[] = ROWS.map((row) => async (client, { arbitrated: address, arbitrator, disputeId }) => {
  const head = (signature: string, encodedArguments: Hex, words: number): Promise<Hex> =>
    rawCall(client, address, concat([toFunctionSelector(signature), encodedArguments]), words * WORD_BYTES);
  const item = headWord(await head(row.mapping, encodeAbiParameters(DISPUTE_KEY, [arbitrator, disputeId]), 1), 1);
  check(item !== 0n);
  const key = numberToHex(item, { size: 32 });
  const info = await head(row.info, key, row.requestsWord);
  check(headWord(info, row.requestsWord - 1) <= 3n);
  const requests = headWord(info, row.requestsWord);
  const { request, rounds } = await newestFirst(requests, async (index) => {
    const [disputed, id, , , , numberOfRounds, , requestArbitrator] = await client.readContract({ address, abi: requestAbi, functionName: "getRequestInfo", args: [key, index] });
    return disputed && id === disputeId && sameAddress(requestArbitrator, arbitrator) ? { request: index, rounds: numberOfRounds } : undefined;
  });
  // Round 0 holds both parties' deposits, never appeal funding.
  check(rounds >= 2n);
  const [, , hasPaid] = await client.readContract({ address, abi: requestAbi, functionName: "getRoundInfo", args: [key, request, rounds - 1n] });
  return paidSides(hasPaid);
});
