import { BrowserRouter } from "react-router";
import { WalletProvider } from "../wallet";
import { ChainNoticeToasts } from "./ChainNoticeToasts";
import { ColorSchemeProvider } from "./colorScheme";
import { RootErrorBoundary } from "./RootErrorBoundary";
import { ToastProvider } from "./ToastProvider";
import type { AppProvidersProps } from "./types";

/**
 * The order is forced: wagmi needs the QueryClient of the data layer above it, the Atlas library needs both, and
 * routing and every page need all three. Routing's chain notices become toasts, so their provider sits inside the
 * toasts. The root boundary is outermost, so a failure anywhere in the tree keeps a minimal frame.
 */
export function AppProviders({ config, dataProvider: DataLayer, atlasGate: AtlasLayer, colorScheme, children }: AppProvidersProps) {
  return (
    <RootErrorBoundary>
      <DataLayer config={config}>
        <WalletProvider config={config}>
          <AtlasLayer config={config}>
            <BrowserRouter>
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
  );
}
