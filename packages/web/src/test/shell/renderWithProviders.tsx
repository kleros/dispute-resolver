import type { ReactElement, ReactNode } from "react";
import type { AtlasUploader } from "../../atlas";
import type { CoreDeps } from "../../data";
import { ChainNoticeToasts, ColorSchemeProvider, PageFrame, ToastProvider } from "../../shell";
import { createColorSchemeStore, type ColorSchemeStore } from "../../theme";
import { TestAtlasProvider } from "../atlas";
import { TestDataProvider } from "../data";
import { renderAtPath, type RoutedRenderResult } from "../routing";
import { TestWalletProvider, createTestWallet, type TestWallet } from "../wallet";

export interface RenderWithProvidersOptions {
  /** The URL the router starts at; default `/1`. The screen renders under the app's `/:chainId` layout. */
  readonly path?: string;
  /** The data layer's core dependencies; default `createTestDeps()`. */
  readonly deps?: CoreDeps;
  /** The wallet; default a disconnected `createTestWallet()`. Connect it with `await result.wallet.connect()`. */
  readonly wallet?: TestWallet;
  /** The Atlas uploader; default `fakeUploader()`. */
  readonly uploader?: AtlasUploader;
  /** `test` (default): routing's `TestFrame`, children only. `page`: the app's `PageFrame` with header and footer. */
  readonly frame?: "test" | "page";
  /** The colour scheme; default a fresh light store on a detached element, so no test themes the document. */
  readonly colorScheme?: ColorSchemeStore;
}

export interface ProvidersRenderResult extends RoutedRenderResult {
  readonly wallet: TestWallet;
}

/**
 * Renders `ui` as a screen of the app, in a `MemoryRouter` at `path` under the `/:chainId` layout route, so
 * `usePageChain()`, `useResolvedChain()`, chain following, its toasts and `useToast()` behave as in the app.
 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}): ProvidersRenderResult {
  const { path = "/1", deps, uploader, frame = "test" } = options;
  const wallet = options.wallet ?? createTestWallet();
  const colorScheme = options.colorScheme ?? createColorSchemeStore({ root: document.createElement("div"), media: null, storage: null });
  function Providers({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider deps={deps}>
        <TestWalletProvider wallet={wallet}>
          <TestAtlasProvider uploader={uploader}>
            <ToastProvider>
              <ChainNoticeToasts>
                <ColorSchemeProvider store={colorScheme}>{children}</ColorSchemeProvider>
              </ChainNoticeToasts>
            </ToastProvider>
          </TestAtlasProvider>
        </TestWalletProvider>
      </TestDataProvider>
    );
  }
  return { ...renderAtPath(ui, path, { wrapper: Providers, frame: frame === "page" ? PageFrame : undefined }), wallet };
}
