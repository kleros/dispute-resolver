import { explorerAddressUrl } from "@dispute-resolver/core";
import type { ResolvedChain } from "../routing";
import { SmartContractWalletWarning, useWallet } from "../wallet";
import { Footer, type FooterExplorerLink } from "./Footer";
import { Header } from "./Header";
import { CONTENT, GUTTER } from "./layout";
import type { PageFrameProps } from "./types";
import { ViewOnlyBanner } from "./ViewOnlyBanner";

/** The URL names a chain that is not configured: the footer says so and links no explorer (spec §2.4). */
function isUnsupportedNetwork(resolvedChain: ResolvedChain): boolean {
  return resolvedChain.kind === "fallback" && resolvedChain.unsupportedSegment !== null;
}

/** spec §2.4 with D-40: the chain's explorer page of its ArbitrableProxy, today's `#code` tab, when the chain has both. */
function explorerLink(resolvedChain: ResolvedChain): FooterExplorerLink | null {
  if (isUnsupportedNetwork(resolvedChain)) return null;
  const { chain } = resolvedChain.page;
  const proxy = chain.arbitrableProxy;
  const url = proxy === undefined ? null : explorerAddressUrl(chain, proxy);
  return url === null ? null : { href: `${url}#code`, chainName: chain.name };
}

/**
 * The frame around every screen (ARCHITECTURE.md §11.2): the header, then the smart-contract-wallet warning (A14) and,
 * while no wallet is connected, the view-only banner (spec §2.3), the screen, and the footer (spec §2.4). Everything in
 * the frame uses the resolved chain (D-45).
 */
export function PageFrame({ resolvedChain, children }: PageFrameProps) {
  const wallet = useWallet();
  const connected = wallet.status === "connected";
  const { chain, chainId } = resolvedChain.page;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header resolvedChain={resolvedChain} connected={connected} />
      {connected ? (
        <div className={GUTTER}>
          <div className={`${CONTENT} [&>*]:pt-4`}>
            <SmartContractWalletWarning chainId={chainId} />
          </div>
        </div>
      ) : (
        <ViewOnlyBanner />
      )}
      <main className={`flex w-full flex-1 flex-col ${GUTTER}`}>
        <div className={`${CONTENT} flex flex-1 flex-col py-6 lg:py-8`}>{children}</div>
      </main>
      <Footer chainLabel={isUnsupportedNetwork(resolvedChain) ? "Unsupported Network" : chain.name} explorer={explorerLink(resolvedChain)} />
    </div>
  );
}
