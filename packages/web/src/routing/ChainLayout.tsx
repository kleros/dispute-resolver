import { Outlet, useParams } from "react-router";
import { CHAIN_PARAM, PageChainContext, useResolvedChain } from "./pageChain";
import type { ChainLayoutProps } from "./types";
import { UnsupportedNetworkScreen } from "./UnsupportedNetworkScreen";
import { useChainFollowing } from "./useChainFollowing";

/**
 * The `/:chainId` layout route element (ARCHITECTURE.md §3.1, §3.2, §3.6). It parses the chain with core's
 * `parseChainId` (A19), follows the wallet's chain (D-55), and renders the frame with the resolved chain (D-45) around
 * either the matched screen of a configured chain or the unsupported-network screen. The screen is keyed by the chain,
 * so nothing a page holds for one chain survives a move to another.
 */
export function ChainLayout({ frame: Frame }: ChainLayoutProps) {
  useChainFollowing();
  const segment = useParams()[CHAIN_PARAM] ?? "";
  const resolvedChain = useResolvedChain();

  const page = resolvedChain.kind === "page" ? resolvedChain.page : null;
  return (
    <PageChainContext.Provider value={page}>
      <Frame resolvedChain={resolvedChain}>{page === null ? <UnsupportedNetworkScreen segment={segment} /> : <Outlet key={page.chainId} />}</Frame>
    </PageChainContext.Provider>
  );
}
