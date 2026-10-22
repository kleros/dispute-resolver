import { createContext, useContext } from "react";
import type { ChainNotice, ChainNoticeProviderProps } from "./types";

type NoticeSink = (notice: ChainNotice) => void;

/** Without a provider, as in routing tests that render the layout alone, a notice goes nowhere. */
const ChainNoticeContext = createContext<NoticeSink>(() => undefined);

/** Shell's toasts are passed in here, so routing never imports shell. */
export function ChainNoticeProvider({ onNotice, children }: ChainNoticeProviderProps) {
  return <ChainNoticeContext.Provider value={onNotice}>{children}</ChainNoticeContext.Provider>;
}

export function useChainNotice(): NoticeSink {
  return useContext(ChainNoticeContext);
}
