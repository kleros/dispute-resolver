import { getAddress, isAddress } from "viem";

/** The EIP-55 form of a well-formed address, or the value unchanged; never throws on untrusted input. */
export function displayAddress(address: string): string {
  return isAddress(address, { strict: false }) ? getAddress(address) : address;
}

export function shortenAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}
