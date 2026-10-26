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
 * The chain's env variable when set and non-blank, else its literal URL, else unconfigured. There is no wallet or
 * public fallback: reads go through the configured RPC only.
 */
export function resolveReadRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution {
  const url = readEnv(env, chain.readRpcEnv) ?? chain.defaultRpcUrl;
  return url === undefined ? { status: "unconfigured", chainId: chain.id } : { status: "configured", url };
}

/**
 * The only RPC URL given to third-party frames and scripts: the chain's public setting when set and non-blank, else
 * the read RPC resolution.
 */
export function resolvePublicRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution {
  const url = readEnv(env, chain.publicRpcEnv);
  return url === undefined ? resolveReadRpcUrl(chain, env) : { status: "configured", url };
}

export function publicRpcUrl(chainId: number, env: Env): string | null {
  const chain = getChain(chainId);
  if (chain === undefined) return null;
  const resolution = resolvePublicRpcUrl(chain, env);
  return resolution.status === "configured" ? resolution.url : null;
}
