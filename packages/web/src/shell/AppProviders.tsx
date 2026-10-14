import { BrowserRouter } from "react-router";
import { WalletProvider } from "../wallet";
import { RootErrorBoundary } from "./RootErrorBoundary";
import { ToastProvider } from "./ToastProvider";
import type { AppProvidersProps } from "./types";

/**
 * The provider tree of ARCHITECTURE.md §2.1, in its forced order: wagmi needs the QueryClient of the data layer above
 * it, the Atlas library needs both, and routing and every page need all three. The root boundary is outermost, so a
 * failure anywhere in the tree keeps a minimal frame.
 */
export function AppProviders({ config, dataProvider: DataLayer, atlasGate: AtlasLayer, children }: AppProvidersProps) {
  return (
    <RootErrorBoundary>
      <DataLayer config={config}>
        <WalletProvider config={config}>
          <AtlasLayer config={config}>
            <BrowserRouter>
              <ToastProvider>{children}</ToastProvider>
            </BrowserRouter>
          </AtlasLayer>
        </WalletProvider>
      </DataLayer>
    </RootErrorBoundary>
  );
}
