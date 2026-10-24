import { Outlet, useParams } from "react-router";
import { PageChainContext, useResolvedChain } from "./pageChain";
import { CHAIN_PARAM } from "./paths";
import type { ChainLayoutProps } from "./types";
import { UnsupportedNetworkScreen } from "./UnsupportedNetworkScreen";
import { useChainFollowing } from "./useChainFollowing";

/** The outlet is keyed by the chain, so nothing a page holds for one chain survives a move to another. */
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
