import type { ChainId, Hex, WriteBuild } from "@dispute-resolver/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { useConfig } from "wagmi";
import { useCoreDeps } from "../data";
import { performWrite, type WriteEnvironment } from "./performWrite";
import { switchWalletChain } from "./switchChain";
import type { WriteController, WriteOptions, WriteStatus } from "./types";
import { useConnectWallet } from "./useConnectWallet";

const IDLE: WriteStatus = { phase: "idle" };

/** The wagmi config and the receipt reader of the data layer (ARCHITECTURE.md §6.4). */
export function useWriteEnvironment(): WriteEnvironment {
  const config = useConfig();
  const deps = useCoreDeps();
  return useMemo(() => ({ config, waitForReceipt: (chainId: ChainId, hash: Hex) => deps.waitForReceipt(chainId, hash) }), [config, deps]);
}

/** One write at a time with its status (ARCHITECTURE.md §6.1). Screens render the status with `WriteStatusNotice`. */
export function useWrite(): WriteController {
  const environment = useWriteEnvironment();
  const connectWallet = useConnectWallet();
  const [status, setStatus] = useState<WriteStatus>(IDLE);
  const lastPageChain = useRef<ChainId | undefined>(undefined);

  const execute = useCallback(
    (build: WriteBuild, options: WriteOptions) => {
      lastPageChain.current = options.pageChainId;
      return performWrite(environment, build, options, setStatus);
    },
    [environment],
  );

  const switchChain = useCallback(
    async (chainId: ChainId) => {
      const result = await switchWalletChain(environment.config, chainId);
      // Once the wallet is on the page chain the refusal no longer applies; the user retries the action.
      if (result.ok) setStatus((current) => (current.phase === "wrong-chain" && current.pageChainId === chainId ? IDLE : current));
      return result.ok;
    },
    [environment],
  );

  const { open } = connectWallet;
  const connect = useCallback(() => {
    open(lastPageChain.current);
  }, [open]);

  const reset = useCallback(() => {
    setStatus(IDLE);
  }, []);

  return useMemo(() => ({ status, execute, switchChain, connect, reset }), [status, execute, switchChain, connect, reset]);
}
