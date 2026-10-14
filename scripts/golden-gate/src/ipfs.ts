import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gatewayUrl } from "../../../packages/core/src/uri";
import type { CanonicalIpfsPath, GatewayOrigin } from "../../../packages/core/src/uri/types";
import { httpGet, type HttpGet } from "./http";
import { writeTextAtomically } from "./output";

export type IpfsText = { readonly ok: true; readonly text: string; readonly cached: boolean } | { readonly ok: false; readonly detail: string };

/** A reader of IPFS content through the gateway. Content is immutable, so a successful answer is cached on disk. */
export interface IpfsReader {
  read(path: CanonicalIpfsPath): Promise<IpfsText>;
}

export function createIpfsReader(options: { readonly gateway: GatewayOrigin; readonly get: HttpGet; readonly cacheDir: string | null }): IpfsReader {
  const inFlight = new Map<string, Promise<IpfsText>>();
  const cacheFile = (path: string) => (options.cacheDir === null ? null : resolve(options.cacheDir, createHash("sha256").update(path).digest("hex")));

  const fetchPath = async (path: CanonicalIpfsPath): Promise<IpfsText> => {
    const file = cacheFile(path);
    if (file !== null && existsSync(file)) return { ok: true, text: readFileSync(file, "utf8"), cached: true };
    const answer = await httpGet(options.get, gatewayUrl(path, options.gateway));
    if (answer.kind === "failed") return { ok: false, detail: answer.detail };
    if (!answer.ok) return { ok: false, detail: `the gateway answered HTTP ${String(answer.status)}` };
    if (file !== null) writeTextAtomically(file, answer.text);
    return { ok: true, text: answer.text, cached: false };
  };

  return {
    read(path) {
      let pending = inFlight.get(path);
      if (pending === undefined) {
        pending = fetchPath(path);
        inFlight.set(path, pending);
      }
      return pending;
    },
  };
}
