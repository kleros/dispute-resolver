import type { Abi } from "viem";

/** KlerosLiquid (`@kleros/kleros`). */
export const klerosLiquidAbi = [
  {
    type: "function",
    name: "disputes",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "subcourtID", type: "uint96" },
      { name: "arbitrated", type: "address" },
      { name: "numberOfChoices", type: "uint256" },
      { name: "period", type: "uint8" },
      { name: "lastPeriodChange", type: "uint256" },
      { name: "drawsInRound", type: "uint256" },
      { name: "commitsInRound", type: "uint256" },
      { name: "ruled", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getDispute",
    stateMutability: "view",
    inputs: [{ name: "_disputeID", type: "uint256" }],
    outputs: [
      { name: "votesLengths", type: "uint256[]" },
      { name: "tokensAtStakePerJuror", type: "uint256[]" },
      { name: "totalFeesForJurors", type: "uint256[]" },
      { name: "votesInEachRound", type: "uint256[]" },
      { name: "repartitionsInEachRound", type: "uint256[]" },
      { name: "penaltiesInEachRound", type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "currentRuling",
    stateMutability: "view",
    inputs: [{ name: "_disputeID", type: "uint256" }],
    outputs: [{ name: "ruling", type: "uint256" }],
  },
  {
    type: "function",
    name: "appealPeriod",
    stateMutability: "view",
    inputs: [{ name: "_disputeID", type: "uint256" }],
    outputs: [
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "appealCost",
    stateMutability: "view",
    inputs: [
      { name: "_disputeID", type: "uint256" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [{ name: "cost", type: "uint256" }],
  },
  {
    type: "function",
    name: "arbitrationCost",
    stateMutability: "view",
    inputs: [{ name: "_extraData", type: "bytes" }],
    outputs: [{ name: "cost", type: "uint256" }],
  },
  {
    type: "function",
    name: "courts",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "parent", type: "uint96" },
      { name: "hiddenVotes", type: "bool" },
      { name: "minStake", type: "uint256" },
      { name: "alpha", type: "uint256" },
      { name: "feeForJuror", type: "uint256" },
      { name: "jurorsForCourtJump", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getSubcourt",
    stateMutability: "view",
    inputs: [{ name: "_subcourtID", type: "uint96" }],
    outputs: [
      { name: "children", type: "uint256[]" },
      { name: "timesPerPeriod", type: "uint256[4]" },
    ],
  },
  {
    type: "event",
    name: "DisputeCreation",
    anonymous: false,
    inputs: [
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_arbitrable", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "NewPeriod",
    anonymous: false,
    inputs: [
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_period", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AppealDecision",
    anonymous: false,
    inputs: [
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_arbitrable", type: "address", indexed: true },
    ],
  },
] as const satisfies Abi;

/** PolicyRegistry (`@kleros/kleros`): the policy URI of a court, whose JSON carries the court name. */
export const policyRegistryAbi = [
  {
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

/** ERC-792 `IArbitrator` (`@kleros/arbitrable-proxy-contracts`). */
export const erc792Abi = [
  {
    type: "function",
    name: "arbitrationCost",
    stateMutability: "view",
    inputs: [{ name: "_extraData", type: "bytes" }],
    outputs: [{ name: "cost", type: "uint256" }],
  },
  {
    type: "function",
    name: "appealCost",
    stateMutability: "view",
    inputs: [
      { name: "_disputeID", type: "uint256" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [{ name: "cost", type: "uint256" }],
  },
  {
    type: "event",
    name: "DisputeCreation",
    anonymous: false,
    inputs: [
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_arbitrable", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AppealDecision",
    anonymous: false,
    inputs: [
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_arbitrable", type: "address", indexed: true },
    ],
  },
] as const satisfies Abi;

/** ERC-1497 `IEvidence` (`@kleros/arbitrable-proxy-contracts`). */
export const erc1497Abi = [
  {
    type: "event",
    name: "MetaEvidence",
    anonymous: false,
    inputs: [
      { name: "_metaEvidenceID", type: "uint256", indexed: true },
      { name: "_evidence", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Evidence",
    anonymous: false,
    inputs: [
      { name: "_arbitrator", type: "address", indexed: true },
      { name: "_evidenceGroupID", type: "uint256", indexed: true },
      { name: "_party", type: "address", indexed: true },
      { name: "_evidence", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Dispute",
    anonymous: false,
    inputs: [
      { name: "_arbitrator", type: "address", indexed: true },
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_metaEvidenceID", type: "uint256", indexed: false },
      { name: "_evidenceGroupID", type: "uint256", indexed: false },
    ],
  },
] as const satisfies Abi;
