import { isAddress } from "viem";
import { z } from "zod";
import type { Address } from "../types";

const addressInputSchema = z.string().refine((value) => isAddress(value, { strict: false }), { message: "Not an EVM address" });

/**
 * Registry addresses are stored lowercase (06 §3 invariant 1). Parses an untrusted string and returns it lowercased,
 * or throws if it is not an EVM address.
 */
export function toRegistryAddress(input: unknown): Address {
  const address = addressInputSchema.parse(input);
  // The cast is sound: `isAddress` accepted a `0x`-prefixed hex string, and lowercasing it yields the lowercase form.
  return address.toLowerCase() as Address;
}
