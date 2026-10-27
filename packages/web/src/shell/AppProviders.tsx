import { BrowserRouter } from "react-router";
import { WalletProvider } from "../wallet";
import { ChainNoticeToasts } from "./ChainNoticeToasts";
import { ColorSchemeProvider } from "./colorScheme";
import { PageScroller, ScrollMemory } from "./PageScroller";
import { RootErrorBoundary } from "./RootErrorBoundary";
import { ToastProvider } from "./ToastProvider";
import type { AppProvidersProps } from "./types";

/**
 * The order is forced: wagmi needs the QueryClient of the data layer above it, the Atlas library needs both, and
 * routing and every page need all three. Routing's chain notices become toasts, so their provider sits inside the
 * toasts. The root boundary is the outermost provider, so a failure anywhere in the tree keeps a minimal frame; the page
 * scroller is around it, needing nothing from it, so that frame scrolls as the app does.
 */
export function AppProviders({ config, dataProvider: DataLayer, atlasGate: AtlasLayer, colorScheme, pageScroll, children }: AppProvidersProps) {
  return (
    <PageScroller scroll={pageScroll}>
      <RootErrorBoundary>
        <DataLayer config={config}>
          <WalletProvider config={config}>
            <AtlasLayer config={config}>
              <BrowserRouter>
                <ScrollMemory />
                <ToastProvider>
                  <ChainNoticeToasts>
                    <ColorSchemeProvider store={colorScheme}>{children}</ColorSchemeProvider>
                  </ChainNoticeToasts>
                </ToastProvider>
              </BrowserRouter>
            </AtlasLayer>
          </WalletProvider>
        </DataLayer>
      </RootErrorBoundary>
    </PageScroller>
  );
}
