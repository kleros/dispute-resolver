import type { Abi } from "viem";
import { uint256Getter } from "./entries";

/**
 * The governor dialect, as the deployed governors' verified sources declare it: poh.eth, ubi-voting.eth and
 * fork-dao.eth carry every entry, kleros.eth every entry but `submitEvidence(string)`. Funding takes the submission
 * index (`_submissionID`), not a ruling; the governor has no local dispute ID, and its session number is the
 * dispute's evidence group.
 */
export const governorAbi = [
  {
    type: "function",
    name: "submitEvidence",
    stateMutability: "nonpayable",
    inputs: [{ name: "_evidenceURI", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fundAppeal",
    stateMutability: "payable",
    inputs: [{ name: "_submissionID", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawFeesAndRewards",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_beneficiary", type: "address" },
      { name: "_session", type: "uint256" },
      { name: "_round", type: "uint256" },
      { name: "_submissionID", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getContributions",
    stateMutability: "view",
    inputs: [
      { name: "_session", type: "uint256" },
      { name: "_round", type: "uint256" },
      { name: "_contributor", type: "address" },
    ],
    outputs: [{ name: "contributions", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getRoundInfo",
    stateMutability: "view",
    inputs: [
      { name: "_session", type: "uint256" },
      { name: "_round", type: "uint256" },
    ],
    outputs: [
      { name: "paidFees", type: "uint256[]" },
      { name: "hasPaid", type: "bool[]" },
      { name: "feeRewards", type: "uint256" },
      { name: "successfullyPaid", type: "uint256" },
    ],
  },
  uint256Getter("winnerMultiplier"),
  uint256Getter("loserMultiplier"),
  uint256Getter("sharedMultiplier"),
  uint256Getter("MULTIPLIER_DIVISOR"),
] as const satisfies Abi;
