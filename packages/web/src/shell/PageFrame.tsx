import { explorerAddressUrl } from "@dispute-resolver/core";
import { useChainClockOffset } from "../data";
import type { FrameProps, ResolvedChain } from "../routing";
import { ChainClockProvider } from "../ui";
import { SmartContractWalletWarning, useWallet } from "../wallet";
import { Footer, type FooterExplorerLink } from "./Footer";
import { Header } from "./Header";
import { CONTENT, GUTTER } from "./layout";
import { isUnsupportedNetwork, UNSUPPORTED_NETWORK_LABEL } from "./unsupportedNetwork";
import { ViewOnlyBanner } from "./ViewOnlyBanner";

function explorerLink(resolvedChain: ResolvedChain): FooterExplorerLink | null {
  if (isUnsupportedNetwork(resolvedChain)) return null;
  const { chain } = resolvedChain.page;
  const proxy = chain.arbitrableProxy;
  const url = proxy === undefined ? null : explorerAddressUrl(chain, proxy);
  return url === null ? null : { href: `${url}#code`, chainName: chain.name };
}

export function PageFrame({ resolvedChain, children }: FrameProps) {
  const wallet = useWallet();
  const connected = wallet.status === "connected";
  const { chain, chainId } = resolvedChain.page;
  const chainClockOffsetMs = useChainClockOffset(resolvedChain.kind === "page" ? chainId : null);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header resolvedChain={resolvedChain} />
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
        <div className={`${CONTENT} flex flex-1 flex-col py-6 lg:py-8`}>
          <ChainClockProvider offsetMs={chainClockOffsetMs}>{children}</ChainClockProvider>
        </div>
      </main>
      <Footer chainLabel={isUnsupportedNetwork(resolvedChain) ? UNSUPPORTED_NETWORK_LABEL : chain.name} explorer={explorerLink(resolvedChain)} />
    </div>
  );
}
