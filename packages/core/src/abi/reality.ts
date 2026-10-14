import type { Abi } from "viem";

/**
 * Reality.eth, the entries of the question lookup (spec 6.1, 6.3, 9.1). Versions 2 and 3 declare the same ones:
 * `templates(id)` returns the block of the template's `LogNewTemplate`.
 */
export const realityAbi = [
  {
    type: "function",
    name: "templates",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "LogNewQuestion",
    anonymous: false,
    inputs: [
      { name: "question_id", type: "bytes32", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "template_id", type: "uint256", indexed: false },
      { name: "question", type: "string", indexed: false },
      { name: "content_hash", type: "bytes32", indexed: true },
      { name: "arbitrator", type: "address", indexed: false },
      { name: "timeout", type: "uint32", indexed: false },
      { name: "opening_ts", type: "uint32", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
      { name: "created", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LogNewTemplate",
    anonymous: false,
    inputs: [
      { name: "template_id", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "question_text", type: "string", indexed: false },
    ],
  },
] as const satisfies Abi;

/**
 * The dispute-to-question mapping of the registered Reality proxies (spec 6.3, 9.1): single-chain proxies emit
 * `DisputeIDToQuestionID`; cross-chain foreign proxies emit `ArbitrationCreated` and some expose the block it was
 * emitted in through `arbitrationCreatedBlock`.
 */
export const realityProxyAbi = [
  {
    type: "function",
    name: "arbitrationCreatedBlock",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "DisputeIDToQuestionID",
    anonymous: false,
    inputs: [
      { name: "_disputeID", type: "uint256", indexed: true },
      { name: "_questionID", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ArbitrationCreated",
    anonymous: false,
    inputs: [
      { name: "_questionID", type: "bytes32", indexed: true },
      { name: "_requester", type: "address", indexed: true },
      { name: "_disputeID", type: "uint256", indexed: true },
    ],
  },
] as const satisfies Abi;
