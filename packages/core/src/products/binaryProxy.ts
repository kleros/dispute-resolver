import { decodeFunctionResult, encodeFunctionData, parseAbi, size, zeroAddress } from "viem";
import { check, fitsBits, paidSides, rawCall, sameAddress, type ProductReader } from "./proof";

const binaryProxyAbi = parseAbi([
  "function arbitrator() view returns (address)",
  "function externalIDtoLocalID(uint256) view returns (uint256)",
  "function disputes(uint256) view returns (bytes, bool isRuled, uint256 ruling, uint256 disputeIDOnArbitratorSide)",
  "function crowdfundingStatus(uint256, address) view returns (uint256[3], bool[3] hasPaid, uint256, uint256[3])",
]);

/** Exactly ten words: an ArbitrableProxy, which answers the calls before it alike, reverts on it instead. */
const FUNDING_STATUS_BYTES = 320;

/** BinaryArbitrableProxy 0.6.4: `crowdfundingStatus` returns the last round, the one `rule()` reads. */
export const readBinaryProxy: ProductReader = async (client, { arbitrated: address, arbitrator, disputeId }) => {
  // Never assume the arbitrator: a sibling proxy without this getter passes every later check, and its rules are unread.
  check(sameAddress(await client.readContract({ address, abi: binaryProxyAbi, functionName: "arbitrator" }), arbitrator));
  const local = await client.readContract({ address, abi: binaryProxyAbi, functionName: "externalIDtoLocalID", args: [disputeId] });
  check(fitsBits(local, 64n));
  const [, isRuled, ruling, id] = await client.readContract({ address, abi: binaryProxyAbi, functionName: "disputes", args: [local] });
  check(isRuled && ruling <= 2n && id === disputeId);
  const data = encodeFunctionData({ abi: binaryProxyAbi, functionName: "crowdfundingStatus", args: [local, zeroAddress] });
  const status = await rawCall(client, address, data, FUNDING_STATUS_BYTES);
  check(size(status) === FUNDING_STATUS_BYTES);
  const [, hasPaid] = decodeFunctionResult({ abi: binaryProxyAbi, functionName: "crowdfundingStatus", data: status });
  return paidSides(hasPaid);
};
