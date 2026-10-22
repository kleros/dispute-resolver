import type { Abi } from "viem";

/** The ArbitrableProxy this app creates disputes through and submits evidence to (`@kleros/arbitrable-proxy-contracts`). */
export const arbitrableProxyAbi = [
  {
    type: "function",
    name: "createDispute",
    stateMutability: "payable",
    inputs: [
      { name: "_arbitratorExtraData", type: "bytes" },
      { name: "_metaevidenceURI", type: "string" },
      { name: "_numberOfRulingOptions", type: "uint256" },
    ],
    outputs: [{ name: "disputeID", type: "uint256" }],
  },
  {
    type: "function",
    name: "submitEvidence",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_evidenceURI", type: "string" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/**
 * IDisputeResolver v2 (the `idr-v2` family).
 *
 * `externalIDtoLocalID` is `view` here, as every deployed implementation exposes it (a public mapping); the interface
 * declares it without `view`, which only matters to Solidity callers. That lets `readContract` reach it.
 */
export const idrV2Abi = [
  {
    type: "function",
    name: "externalIDtoLocalID",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMultipliers",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "winnerStakeMultiplier", type: "uint256" },
      { name: "loserStakeMultiplier", type: "uint256" },
      { name: "loserAppealPeriodMultiplier", type: "uint256" },
      { name: "denominator", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "fundAppeal",
    stateMutability: "payable",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_ruling", type: "uint256" },
    ],
    outputs: [{ name: "fullyFunded", type: "bool" }],
  },
  {
    type: "function",
    name: "getTotalWithdrawableAmount",
    stateMutability: "view",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_contributor", type: "address" },
      { name: "_ruling", type: "uint256" },
    ],
    outputs: [{ name: "sum", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawFeesAndRewardsForAllRounds",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_contributor", type: "address" },
      { name: "_ruling", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Contribution",
    anonymous: false,
    inputs: [
      { name: "_localDisputeID", type: "uint256", indexed: true },
      { name: "_round", type: "uint256", indexed: true },
      { name: "ruling", type: "uint256", indexed: false },
      { name: "_contributor", type: "address", indexed: true },
      { name: "_amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RulingFunded",
    anonymous: false,
    inputs: [
      { name: "_localDisputeID", type: "uint256", indexed: true },
      { name: "_round", type: "uint256", indexed: true },
      { name: "_ruling", type: "uint256", indexed: true },
    ],
  },
] as const satisfies Abi;

/**
 * IDisputeResolver v1 (the `idr-v1` family, Unslashed among them): the withdrawable read and the withdrawal take the
 * array of rulings the contributor funded.
 */
export const idrV1Abi = [
  {
    type: "function",
    name: "getTotalWithdrawableAmount",
    stateMutability: "view",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_contributor", type: "address" },
      { name: "_contributedTo", type: "uint256[]" },
    ],
    outputs: [{ name: "sum", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawFeesAndRewardsForAllRounds",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_contributor", type: "address" },
      { name: "_contributedTo", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/**
 * The two `fundAppeal` overloads of the `idr-legacy` family. `(uint256,uint256)` is the IDisputeResolver one;
 * `(uint256,uint8)` is the older resolver proxy's (verified source of `0x135c5735…`, the party as a `uint8`).
 */
export const idrLegacyFundAppealAbi = [
  {
    type: "function",
    name: "fundAppeal",
    stateMutability: "payable",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_ruling", type: "uint256" },
    ],
    outputs: [{ name: "fullyFunded", type: "bool" }],
  },
  {
    type: "function",
    name: "fundAppeal",
    stateMutability: "payable",
    inputs: [
      { name: "_localDisputeID", type: "uint256" },
      { name: "_side", type: "uint8" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/** Escrow V1, `MultipleArbitrableTokenTransaction` (`@kleros/kleros-interaction`). */
export const escrowV1Abi = [
  {
    type: "function",
    name: "disputeIDtoTransactionID",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "appeal",
    stateMutability: "payable",
    inputs: [{ name: "_transactionID", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitEvidence",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_transactionID", type: "uint256" },
      { name: "_evidence", type: "string" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

const uint256Getter = <const TName extends string>(name: TName) =>
  ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  }) as const;

/**
 * The single-value multiplier getters, tried field by field when `getMultipliers()` fails: the
 * ArbitrableProxy names, the governor names (`winnerMultiplier`, `loserMultiplier`, `MULTIPLIER_DIVISOR`) and the two
 * denominator spellings some arbitrables use.
 */
export const multiplierGetterAbi = [
  uint256Getter("winnerStakeMultiplier"),
  uint256Getter("winnerMultiplier"),
  uint256Getter("loserStakeMultiplier"),
  uint256Getter("loserMultiplier"),
  uint256Getter("denominator"),
  uint256Getter("MULTIPLIER_DIVISOR"),
  uint256Getter("MULTIPLIER_DENOMINATOR"),
  uint256Getter("loserAppealPeriodMultiplier"),
] as const satisfies Abi;
