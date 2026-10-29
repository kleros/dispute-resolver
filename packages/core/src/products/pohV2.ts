import { concat, hexToBigInt, keccak256, numberToHex, pad, parseAbi } from "viem";
import type { Hex } from "../types";
import { check, sameAddress, sideFunded, type ProductReader } from "./proof";

const pohV2Abi = parseAbi([
  "function disputeIdToData(address, uint256) view returns (uint256 requestId, uint256 challengeId, bytes20 humanityId)",
  "function arbitratorDataHistory(uint256) view returns (uint256 metaEvidenceUpdates, address arbitrator)",
]);

/**
 * No getter of Proof of Humanity v2 returns a challenge's last round or its funded side, so they come from the proxy's
 * storage as ProofOfHumanityExtended lays it out: `humanityData` at slot 61; a request word packs, from its low byte,
 * revocation, status, currentReason, usedReasons, arbitratorDataId (16 bits) and lastChallengeId (16 bits); a challenge
 * word packs lastRoundId (16 bits), ruling (8) and challenger (160). A layout an upgrade moved fails these checks.
 */
const HUMANITY_DATA_SLOT = 61n;

const word = (value: bigint): Hex => numberToHex(value, { size: 32 });
const mappingSlot = (key: Hex, slot: bigint): bigint => hexToBigInt(keccak256(concat([key, word(slot)])));
const field = (packed: bigint, offset: bigint, bits: bigint): bigint => (packed >> offset) & ((1n << bits) - 1n);

export const readPohV2: ProductReader = async (client, { arbitrated: address, arbitrator, disputeId }) => {
  const stored = async (slot: bigint): Promise<bigint> => {
    const value = await client.getStorageAt({ address, slot: word(slot) });
    check(value !== undefined);
    return hexToBigInt(value);
  };
  const [requestId, challengeId, humanityId] = await client.readContract({ address, abi: pohV2Abi, functionName: "disputeIdToData", args: [arbitrator, disputeId] });
  check(hexToBigInt(humanityId) !== 0n);
  const requests = mappingSlot(pad(humanityId, { dir: "right" }), HUMANITY_DATA_SLOT) + 3n;
  check((await stored(requests)) > requestId);
  const request = hexToBigInt(keccak256(word(requests))) + 4n * requestId;
  const packed = await stored(request);
  check(field(packed, 8n, 8n) <= 3n && challengeId < field(packed, 48n, 16n));
  const [, dataArbitrator] = await client.readContract({ address, abi: pohV2Abi, functionName: "arbitratorDataHistory", args: [field(packed, 32n, 16n)] });
  check(sameAddress(dataArbitrator, arbitrator));
  const challenge = mappingSlot(word(challengeId), request + 3n);
  const head = await stored(challenge);
  const lastRoundId = field(head, 0n, 16n);
  // Round 0 holds the challenge deposit, never appeal funding.
  check(head >> 184n === 0n && lastRoundId >= 1n && field(head, 16n, 8n) <= 2n && field(head, 24n, 160n) !== 0n);
  check((await stored(challenge + 1n)) === disputeId);
  return sideFunded(await stored(mappingSlot(word(lastRoundId), challenge + 2n)));
};
