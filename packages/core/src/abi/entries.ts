export const uint256Getter = <const TName extends string>(name: TName) =>
  ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  }) as const;
