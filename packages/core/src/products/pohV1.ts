import { parseAbi, zeroAddress } from "viem";
import { check, fitsBits, newestFirst, sameAddress, sideFunded, type ProductReader } from "./proof";

const pohV1Abi = parseAbi([
  "function arbitratorDisputeIDToDisputeData(address, uint256) view returns (uint256 challengeID, address submissionID)",
  "function getSubmissionInfo(address) view returns (uint256, uint256, uint256, bool, bool, uint256 numberOfRequests)",
  "function getRequestInfo(address, uint256) view returns (bool, bool, bool, uint256, uint256, uint256 lastChallengeID, uint256 arbitratorDataID)",
  "function getChallengeInfo(address, uint256, uint256) view returns (uint256 lastRoundID, address challenger, uint256 disputeID)",
  "function getRoundInfo(address, uint256, uint256, uint256) view returns (bool, uint256[3], uint256 sideFunded)",
  "function arbitratorDataList(uint256) view returns (address)",
]);

/**
 * Proof of Humanity v1. Its dispute data names the challenge but not the request: `rule()` took the submission's newest
 * request at the time, and a later request can exist, so the request is the newest whose challenge is this dispute.
 */
export const readPohV1: ProductReader = async (client, { arbitrated: address, arbitrator, disputeId }) => {
  const [challengeID, submission] = await client.readContract({ address, abi: pohV1Abi, functionName: "arbitratorDisputeIDToDisputeData", args: [arbitrator, disputeId] });
  check(submission !== zeroAddress);
  const [, , , , , requests] = await client.readContract({ address, abi: pohV1Abi, functionName: "getSubmissionInfo", args: [submission] });
  const { request, lastRoundID } = await newestFirst(requests, async (index) => {
    const [lastRound, , id] = await client.readContract({ address, abi: pohV1Abi, functionName: "getChallengeInfo", args: [submission, index, challengeID] });
    return id === disputeId ? { request: index, lastRoundID: lastRound } : undefined;
  });
  const [, , , , , lastChallengeID, arbitratorDataID] = await client.readContract({ address, abi: pohV1Abi, functionName: "getRequestInfo", args: [submission, request] });
  check(challengeID < lastChallengeID && fitsBits(lastChallengeID, 16n) && fitsBits(arbitratorDataID, 16n));
  check(sameAddress(await client.readContract({ address, abi: pohV1Abi, functionName: "arbitratorDataList", args: [arbitratorDataID] }), arbitrator));
  // Round 0 holds the challenge deposit, never appeal funding.
  check(lastRoundID >= 1n && fitsBits(lastRoundID, 16n));
  const [, , side] = await client.readContract({ address, abi: pohV1Abi, functionName: "getRoundInfo", args: [submission, request, challengeID, lastRoundID] });
  return sideFunded(side);
};
