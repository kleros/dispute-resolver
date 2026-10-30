import { createContext, useContext, type ReactNode } from "react";
import type { ChainNotice } from "./types";

type NoticeSink = (notice: ChainNotice) => void;

interface ChainNoticeProviderProps {
  readonly onNotice: NoticeSink;
  readonly children?: ReactNode;
}

/** Without a provider, as in routing tests that render the layout alone, a notice goes nowhere. */
const ChainNoticeContext = createContext<NoticeSink>(() => undefined);

export function ChainNoticeProvider({ onNotice, children }: ChainNoticeProviderProps) {
  return <ChainNoticeContext.Provider value={onNotice}>{children}</ChainNoticeContext.Provider>;
}

export function useChainNotice(): NoticeSink {
  return useContext(ChainNoticeContext);
}
