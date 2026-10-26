import { z } from "../zod";
import type { Env } from "../types";
import { getChain } from "./table";
import type { ChainConfig, RpcUrlResolution } from "./types";

const nonBlankSetting = z.string().trim().min(1);

function readEnv(env: Env, name: string | undefined): string | undefined {
  if (name === undefined || !Object.hasOwn(env, name)) return undefined;
  const parsed = nonBlankSetting.safeParse(env[name]);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The chain's env variable when set and non-blank, else its literal URL, else unconfigured. There is no wallet
 * fallback: reads go through the configured RPC only.
 */
export function resolveReadRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution {
  const url = readEnv(env, chain.readRpcEnv) ?? chain.defaultRpcUrl;
  return url === undefined ? { status: "unconfigured", chainId: chain.id } : { status: "configured", url };
}

/** The configured read RPC URL of `chainId`, or `null` for an unsupported or unconfigured chain. */
export function readRpcUrl(chainId: number, env: Env): string | null {
  const chain = getChain(chainId);
  if (chain === undefined) return null;
  const resolution = resolveReadRpcUrl(chain, env);
  return resolution.status === "configured" ? resolution.url : null;
}
