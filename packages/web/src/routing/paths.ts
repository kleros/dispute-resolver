import { getChain, parseChainId, parseDisputeId } from "@dispute-resolver/core";
import { matchRoutes, type RouteObject } from "react-router";
import { maxUint256 } from "viem";
import type { PathLocation } from "./types";

export const CHAIN_PARAM = "chainId";

/** The case routes under `/:chainId`, as `createAppRoutes` declares them. */
export const CASE_ROUTE = "cases/:id?";
export const INTERACT_ROUTE = "interact/:id/*";

const ALL_DIGITS = /^\d+$/;

/** Says nothing about whether the chain is configured. */
export function isChainNumber(chainId: number): boolean {
  return Number.isSafeInteger(chainId) && chainId > 0;
}

/** Anything but a configured chain is a programming error, never a URL. */
function chainSegment(chainId: number): string {
  if (!isChainNumber(chainId) || getChain(chainId) === undefined) throw new RangeError("A path needs a configured chain ID.");
  return String(chainId);
}

function disputeSegment(disputeId: bigint): string {
  if (typeof disputeId !== "bigint" || disputeId < 0n || disputeId > maxUint256) throw new RangeError("A case path needs a dispute ID between 0 and 2^256 - 1.");
  return disputeId.toString();
}

/** Validated chain IDs and numeric dispute IDs only. */
export const paths = Object.freeze({
  chainRoot: (chainId: number) => `/${chainSegment(chainId)}`,
  ongoing: (chainId: number) => `/${chainSegment(chainId)}/ongoing`,
  create: (chainId: number) => `/${chainSegment(chainId)}/create`,
  cases: (chainId: number) => `/${chainSegment(chainId)}/cases`,
  case: (chainId: number, disputeId: bigint) => `/${chainSegment(chainId)}/cases/${disputeSegment(disputeId)}`,
});

export function replaceChainSegment(pathname: string, chainId: number): string {
  const segment = walletChainSegment(chainId);
  const parts = pathname.split("/");
  const first = parts[1] ?? "";
  if (ALL_DIGITS.test(first)) parts[1] = segment;
  else parts.splice(1, 0, segment);
  return parts.join("/");
}

/**
 * Inside the `/:chainId` layout the first segment is always the chain parameter, even one that names no chain
 * (`/abc/ongoing`), so it is replaced rather than kept.
 */
function withChainSegment(pathname: string, segment: string): string {
  const parts = pathname.split("/");
  parts[1] = segment;
  return parts.join("/");
}

export function switchChainSegment(pathname: string, chainId: number): string {
  return withChainSegment(pathname, chainSegment(chainId));
}

/** The wallet's chain may be unconfigured: its path then shows the unsupported-network screen. */
function walletChainSegment(chainId: number): string {
  if (!isChainNumber(chainId)) throw new RangeError("A chain ID is a positive integer.");
  return String(chainId);
}

const CASE_ROUTES: RouteObject[] = [{ path: `:${CHAIN_PARAM}`, children: [{ path: CASE_ROUTE }, { path: INTERACT_ROUTE }] }];

interface CaseSegments {
  readonly chain: string;
  readonly id: string;
}

/**
 * The chain and ID segments of a case page with an ID; `null` on any other page. The router decodes a path and ignores
 * letter case before matching, so `/1/CASES/5` and `/1/%63ases/5` open case 5 too: the raw segments cannot tell.
 */
function caseSegments(pathname: string): CaseSegments | null {
  const params = matchRoutes(CASE_ROUTES, pathname)?.at(-1)?.params;
  const id = params?.id;
  return id === undefined || id === "" ? null : { chain: params?.[CHAIN_PARAM] ?? "", id };
}

/** The dispute ID of a case page's path; `null` on any other page or when the ID does not parse. */
export function pathDisputeId(pathname: string): bigint | null {
  const segments = caseSegments(pathname);
  return segments === null ? null : parseDisputeId(segments.id);
}

/**
 * Where the app goes when it moves to the wallet's chain. A case page goes to that chain's Ongoing Disputes: the same
 * number there is another dispute. Every other page keeps its path, search and hash, including a page whose chain
 * segment names no configured chain.
 */
export function walletChainLocation({ pathname, search, hash }: PathLocation, walletChainId: number): PathLocation {
  const segment = walletChainSegment(walletChainId);
  const segments = caseSegments(pathname);
  if (segments !== null && parseChainId(segments.chain) !== undefined) return { pathname: `/${segment}/ongoing`, search: "", hash: "" };
  return { pathname: withChainSegment(pathname, segment), search, hash };
}
