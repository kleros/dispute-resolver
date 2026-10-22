import type { Address, ScriptParameters } from "@dispute-resolver/core";
import { PROTOCOL_VERSION, RUN_MESSAGE_TYPE } from "../protocol";
import type { RpcRedirectRule, RunnerRequestMessage } from "../types";

// Hand-written because the bootstrap is its own small build and imports no validation library. The host validated
// the parameters already; these checks only make sure the page never works on a value of the wrong shape.

type UnknownRecord = Readonly<Record<string, unknown>>;

const LOWERCASE_ADDRESS = /^0x[0-9a-f]{40}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && LOWERCASE_ADDRESS.test(value);
}

function isChainId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseParams(value: unknown): ScriptParameters | undefined {
  if (!isRecord(value)) return;
  const { disputeID, arbitrableContractAddress, arbitratorChainID, arbitrableChainID, arbitratorJsonRpcUrl, arbitrableJsonRpcUrl } = value;
  if (typeof disputeID !== "string" || !isAddress(arbitrableContractAddress)) return;
  if (!isChainId(arbitratorChainID) || !isChainId(arbitrableChainID)) return;
  if (!isStringOrNull(arbitratorJsonRpcUrl) || !isStringOrNull(arbitrableJsonRpcUrl)) return;
  return { disputeID, arbitrableContractAddress, arbitratorChainID, arbitrableChainID, arbitratorJsonRpcUrl, arbitrableJsonRpcUrl };
}

function parseRule(value: unknown): RpcRedirectRule | undefined {
  if (!isRecord(value)) return;
  const { chainId, host, pathPrefix, target } = value;
  if (!isChainId(chainId) || typeof host !== "string" || typeof pathPrefix !== "string" || typeof target !== "string") return;
  return { chainId, host, pathPrefix, target };
}

function parseRules(value: unknown): RpcRedirectRule[] | undefined {
  if (!Array.isArray(value)) return;
  const rules: RpcRedirectRule[] = [];
  for (const entry of value) {
    const rule = parseRule(entry);
    if (rule === undefined) return;
    rules.push(rule);
  }
  return rules;
}

export function parseRunRequest(data: unknown): RunnerRequestMessage | undefined {
  if (!isRecord(data) || data.type !== RUN_MESSAGE_TYPE || data.version !== PROTOCOL_VERSION) return;
  const { scriptText, guardSource } = data;
  if (typeof scriptText !== "string" || !isStringOrNull(guardSource)) return;
  const params = parseParams(data.params);
  const rpcRedirects = parseRules(data.rpcRedirects);
  if (params === undefined || rpcRedirects === undefined) return;
  return { type: RUN_MESSAGE_TYPE, version: PROTOCOL_VERSION, scriptText, params, guardSource, rpcRedirects };
}
