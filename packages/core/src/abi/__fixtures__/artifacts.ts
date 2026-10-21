/**
 * Test-only loader: the published artifacts (devDependencies) and the recorded verified ABIs, parsed into one
 * normalized shape so the tests can compare an embedded entry with its source entry for entry. Parameter names, types,
 * indexed flags and mutability are kept; `internalType`, `constant` and `payable` (which solc 0.4 artifacts and Sourcify
 * spell differently) are dropped.
 */
import { z } from "../../zod";
import realityEth30Abi from "@reality.eth/contracts/abi/solc-0.8.6/RealityETH-3.0.abi.json";
import realityEth32Abi from "@reality.eth/contracts/abi/solc-0.8.6/RealityETH-3.2.abi.json";
import arbitrableProxy from "@kleros/arbitrable-proxy-contracts/build/contracts/ArbitrableProxy.json";
import iArbitrator from "@kleros/arbitrable-proxy-contracts/build/contracts/IArbitrator.json";
import iEvidence from "@kleros/arbitrable-proxy-contracts/build/contracts/IEvidence.json";
import klerosGovernor from "@kleros/kleros/build/contracts/KlerosGovernor.json";
import klerosLiquid from "@kleros/kleros/build/contracts/KlerosLiquid.json";
import policyRegistry from "@kleros/kleros/build/contracts/PolicyRegistry.json";
import multipleArbitrableTokenTransaction from "@kleros/kleros-interaction/build/contracts/MultipleArbitrableTokenTransaction.json";
import realitio from "@kleros/kleros-interaction/build/contracts/Realitio.json";
import realitioArbitratorProxy from "@kleros/kleros-interaction/build/contracts/RealitioArbitratorProxy.json";
import realitioErc20 from "@kleros/kleros-interaction/build/contracts/RealitioERC20.json";
import idrV1 from "IDRv1/build/contracts/IDisputeResolver.json";
import idrV2 from "IDRv2/build/contracts/IDisputeResolver.json";
import verified from "./verified-abis.json";

export interface NormalizedParameter {
  readonly name: string;
  readonly type: string;
  readonly indexed?: boolean;
  readonly components?: readonly NormalizedParameter[];
}

export interface NormalizedFunction {
  readonly type: "function";
  readonly name: string;
  readonly inputs: readonly NormalizedParameter[];
  readonly outputs: readonly NormalizedParameter[];
  readonly stateMutability: string;
}

export interface NormalizedEvent {
  readonly type: "event";
  readonly name: string;
  readonly inputs: readonly NormalizedParameter[];
  readonly anonymous: boolean;
}

export type NormalizedItem = NormalizedFunction | NormalizedEvent;

const parameterSchema: z.ZodType<NormalizedParameter> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.string(),
    indexed: z.boolean().optional(),
    components: z.array(parameterSchema).optional(),
  }),
);

const functionSchema = z.object({
  type: z.literal("function"),
  name: z.string(),
  inputs: z.array(parameterSchema),
  outputs: z.array(parameterSchema),
  stateMutability: z.string(),
});

const eventSchema = z.object({
  type: z.literal("event"),
  name: z.string(),
  inputs: z.array(parameterSchema),
  anonymous: z.boolean(),
});

const abiSchema = z.array(z.unknown());

/** Drops the keys that never matter: undefined `indexed` on function parameters, and nested empties. */
function withoutUndefined(parameter: NormalizedParameter): NormalizedParameter {
  return {
    name: parameter.name,
    type: parameter.type,
    ...(parameter.indexed === undefined ? {} : { indexed: parameter.indexed }),
    ...(parameter.components === undefined ? {} : { components: parameter.components.map(withoutUndefined) }),
  };
}

/** Keeps functions and events of an untrusted ABI array and normalizes them. Constructors, fallbacks and errors are skipped. */
export function normalizeAbi(abi: unknown): NormalizedItem[] {
  const items: NormalizedItem[] = [];
  for (const raw of abiSchema.parse(abi)) {
    const asFunction = functionSchema.safeParse(raw);
    if (asFunction.success) {
      items.push({
        ...asFunction.data,
        inputs: asFunction.data.inputs.map(withoutUndefined),
        outputs: asFunction.data.outputs.map(withoutUndefined),
      });
      continue;
    }
    const asEvent = eventSchema.safeParse(raw);
    if (asEvent.success) items.push({ ...asEvent.data, inputs: asEvent.data.inputs.map(withoutUndefined) });
  }
  return items;
}

/** The canonical signature of a normalized function or event, e.g. `fundAppeal(uint256,uint256)`. */
export function signatureOf(item: NormalizedItem): string {
  return `${item.name}(${item.inputs.map((input) => input.type).join(",")})`;
}

const artifactAbi = z.object({ abi: z.array(z.unknown()) });

function fromArtifact(artifact: unknown): NormalizedItem[] {
  return normalizeAbi(artifactAbi.parse(artifact).abi);
}

export const ARTIFACTS = {
  klerosLiquid: fromArtifact(klerosLiquid),
  klerosGovernor: fromArtifact(klerosGovernor),
  policyRegistry: fromArtifact(policyRegistry),
  arbitrableProxy: fromArtifact(arbitrableProxy),
  iArbitrator: fromArtifact(iArbitrator),
  iEvidence: fromArtifact(iEvidence),
  idrV1: fromArtifact(idrV1),
  idrV2: fromArtifact(idrV2),
  escrowV1: fromArtifact(multipleArbitrableTokenTransaction),
  realitio: fromArtifact(realitio),
  realitioErc20: fromArtifact(realitioErc20),
  realitioArbitratorProxy: fromArtifact(realitioArbitratorProxy),
  realityEth30: normalizeAbi(realityEth30Abi),
  realityEth32: normalizeAbi(realityEth32Abi),
} as const;

const verifiedSchema = z.object({
  governors: z.array(z.object({ label: z.string(), chainId: z.number(), address: z.string(), abi: z.array(z.unknown()) })),
  legacyResolver: z.object({ chainId: z.number(), address: z.string(), abi: z.array(z.unknown()) }),
  crossChainRealityProxies: z.array(z.object({ chainId: z.number(), address: z.string(), abi: z.array(z.unknown()) })),
});

const parsedVerified = verifiedSchema.parse(verified);

export interface VerifiedContract {
  readonly label: string;
  readonly chainId: number;
  readonly address: string;
  readonly abi: readonly NormalizedItem[];
}

/** Sourcify-verified ABIs recorded in `verified-abis.json` (the deployed governors, the legacy resolver, cross-chain proxies). */
export const VERIFIED = {
  governors: parsedVerified.governors.map((governor): VerifiedContract => ({ ...governor, abi: normalizeAbi(governor.abi) })),
  legacyResolver: {
    ...parsedVerified.legacyResolver,
    label: "older resolver proxy",
    abi: normalizeAbi(parsedVerified.legacyResolver.abi),
  } satisfies VerifiedContract,
  crossChainRealityProxies: parsedVerified.crossChainRealityProxies.map((proxy): VerifiedContract => ({
    ...proxy,
    label: "cross-chain Reality proxy",
    abi: normalizeAbi(proxy.abi),
  })),
} as const;

/** Finds the one item with the given canonical signature, or throws so a missing source entry fails the test loudly. */
export function findBySignature(items: readonly NormalizedItem[], signature: string, kind: "function" | "event"): NormalizedItem {
  const matches = items.filter((item) => item.type === kind && signatureOf(item) === signature);
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) throw new Error(`Expected exactly one ${kind} ${signature}, found ${String(matches.length)}`);
  return match;
}
