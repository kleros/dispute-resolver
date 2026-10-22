/**
 * Test-only view of the recorded `eth_getCode` fixtures: contracts of every family on each chain, read at the block
 * number each file names, with the implementation's code for EIP-1967 proxies. `expectedSelectors` freezes the probe
 * signatures each dispatcher carries (the implementation's for EIP-1967 proxies), transcribed once by an independent
 * disassembler, so detection is checked against reviewed data rather than against the scanner under test.
 */
import { z } from "../../zod";
import { SELECTORS } from "../../abi";
import type { ProbeSignature } from "../../abi";
import { toRegistryAddress } from "../../registry";
import type { Address, ChainId, Hex } from "../../types";
import type { Family } from "../types";
import bytecode1 from "./bytecode-1.json";
import bytecode100 from "./bytecode-100.json";
import bytecode10200 from "./bytecode-10200.json";
import bytecode11155111 from "./bytecode-11155111.json";

const FAMILIES = ["reality-proxy", "escrow-v1", "governor", "idr-v2", "idr-v1", "idr-legacy", "view-only"] as const satisfies readonly Family[];

const hexSchema = z
  .string()
  .regex(/^0x(?:[0-9a-f]{2})*$/i)
  .transform((value): Hex => value as Hex);
const probeSignatureSchema = z
  .string()
  .refine((value) => Object.hasOwn(SELECTORS, value), { message: "not a probe signature" })
  .transform((value): ProbeSignature => value as ProbeSignature);
const addressSchema = z.string().transform((value) => toRegistryAddress(value));

const recordSchema = z.object({
  chainId: z.number(),
  blockNumber: z.number(),
  contracts: z.array(
    z.object({
      address: addressSchema,
      label: z.string(),
      expectedFamily: z.enum(FAMILIES),
      expectedSelectors: z.array(probeSignatureSchema),
      code: hexSchema,
      eip1967Implementation: z.object({ address: addressSchema, code: hexSchema }).optional(),
    }),
  ),
});

/** The selectors of `signatures`, in `SELECTORS` order (the order `detectFamily` reports them in). */
function inSelectorOrder(signatures: readonly ProbeSignature[]): Hex[] {
  const wanted = new Set(signatures.map((signature) => SELECTORS[signature]));
  return Object.values(SELECTORS).filter((selector) => wanted.has(selector));
}

export interface RecordedContract {
  readonly chainId: ChainId;
  readonly blockNumber: number;
  readonly address: Address;
  readonly label: string;
  readonly expectedFamily: Family;
  /** The probe selectors of the scanned dispatcher, in `SELECTORS` order. */
  readonly expectedSelectors: readonly Hex[];
  readonly code: Hex;
  readonly implementation: { readonly address: Address; readonly code: Hex } | null;
}

export const RECORDED_CONTRACTS: readonly RecordedContract[] = [bytecode1, bytecode100, bytecode10200, bytecode11155111].flatMap((raw) => {
  const record = recordSchema.parse(raw);
  return record.contracts.map((contract): RecordedContract => ({
    chainId: record.chainId,
    blockNumber: record.blockNumber,
    address: contract.address,
    label: contract.label,
    expectedFamily: contract.expectedFamily,
    expectedSelectors: inSelectorOrder(contract.expectedSelectors),
    code: contract.code,
    implementation: contract.eip1967Implementation ?? null,
  }));
});

/** The recorded contract at `address` on `chainId`; throws when it was not recorded, so a typo fails the test loudly. */
export function recorded(chainId: ChainId, address: string): RecordedContract {
  const wanted = toRegistryAddress(address);
  const contract = RECORDED_CONTRACTS.find((candidate) => candidate.chainId === chainId && candidate.address === wanted);
  if (contract === undefined) throw new Error(`no recorded bytecode for ${String(chainId)}:${wanted}`);
  return contract;
}
