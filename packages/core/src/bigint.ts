import { maxUint256 } from "viem";

export function compareBigint(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isUint256(value: bigint): boolean {
  return value >= 0n && value <= maxUint256;
}
