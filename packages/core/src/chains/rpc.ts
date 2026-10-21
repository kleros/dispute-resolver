import { z } from "../zod";
import type { Env } from "../types";
import type { ChainConfig, RpcUrlResolution } from "./types";

const nonBlankSetting = z.string().trim().min(1);

/** The trimmed value of an env variable, or `undefined` when it is unset, not a string or blank. */
function readEnv(env: Env, name: string | undefined): string | undefined {
  if (name === undefined || !Object.hasOwn(env, name)) return undefined;
  const parsed = nonBlankSetting.safeParse(env[name]);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The read RPC of a chain (A13, D-56): its env variable when set and non-blank, else its literal URL, else
 * unconfigured. There is no wallet or public fallback. Never throws, for any chain (D-18).
 */
export function resolveReadRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution {
  const url = readEnv(env, chain.readRpcEnv) ?? chain.defaultRpcUrl;
  return url === undefined ? { status: "unconfigured", chainId: chain.id } : { status: "configured", url };
}

/**
 * The only RPC URL given to third-party frames and scripts (D-35): the chain's public setting when set and
 * non-blank, else the read RPC resolution.
 */
export function resolvePublicRpcUrl(chain: ChainConfig, env: Env): RpcUrlResolution {
  const url = readEnv(env, chain.publicRpcEnv);
  return url === undefined ? resolveReadRpcUrl(chain, env) : { status: "configured", url };
}
