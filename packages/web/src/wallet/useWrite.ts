import type { Address, Hex, WriteBuild, WriteCall } from "@dispute-resolver/core";
import { useCallback, useMemo, useState } from "react";
import { useConfig } from "wagmi";
import { useCoreDeps } from "../data";
import { performWrite, type WriteEnvironment } from "./performWrite";
import type { WriteController, WriteOptions, WriteStatus } from "./types";

const IDLE: WriteStatus = { phase: "idle" };

export function useWriteEnvironment(): WriteEnvironment {
  const config = useConfig();
  const deps = useCoreDeps();
  return useMemo(
    () => ({
      config,
      waitForReceipt: (chainId: number, hash: Hex) => deps.waitForReceipt(chainId, hash),
      simulate: (call: WriteCall, from: Address) => deps.simulate(call, from),
    }),
    [config, deps],
  );
}

/**
 * One write at a time with its status. Screens render the status with `WriteStatusNotice`, which also offers the switch
 * of a `wrong-chain` refusal and the Connect of `needs-wallet`.
 */
export function useWrite(): WriteController {
  const environment = useWriteEnvironment();
  const [status, setStatus] = useState<WriteStatus>(IDLE);

  const execute = useCallback((build: WriteBuild, options: WriteOptions) => performWrite(environment, build, options, setStatus), [environment]);

  const reset = useCallback(() => {
    setStatus(IDLE);
  }, []);

  return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
}
