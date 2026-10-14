import type { ReactElement, ReactNode } from "react";
import { Route, Routes } from "react-router";
import type { AtlasUploader } from "../../atlas";
import type { CoreDeps } from "../../data";
import { ChainLayout } from "../../routing";
import { PageFrame, ToastProvider } from "../../shell";
import { TestAtlasProvider } from "../atlas";
import { TestDataProvider } from "../data";
import { renderAtPath, renderInRouter, type RoutedRenderResult } from "../routing";
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
}

export interface ProvidersRenderResult extends RoutedRenderResult {
  readonly wallet: TestWallet;
}

/**
 * Renders `ui` as a screen of the app (ARCHITECTURE.md §1.5): `TestDataProvider` → `TestWalletProvider` →
 * `TestAtlasProvider` → `ToastProvider` around a `MemoryRouter` at `path`, under the `/:chainId` layout route, so
 * `usePageChain()`, `useResolvedChain()`, chain following and `useToast()` behave as in the app.
 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}): ProvidersRenderResult {
  const { path = "/1", deps, uploader, frame = "test" } = options;
  const wallet = options.wallet ?? createTestWallet();
  function Providers({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider deps={deps}>
        <TestWalletProvider wallet={wallet}>
          <TestAtlasProvider uploader={uploader}>
            <ToastProvider>{children}</ToastProvider>
          </TestAtlasProvider>
        </TestWalletProvider>
      </TestDataProvider>
    );
  }
  const result =
    frame === "test"
      ? renderAtPath(ui, path, { wrapper: Providers })
      : renderInRouter(
          <Routes>
            <Route path=":chainId" element={<ChainLayout frame={PageFrame} />}>
              <Route index element={ui} />
              <Route path="*" element={ui} />
            </Route>
          </Routes>,
          path,
          { wrapper: Providers },
        );
  return { ...result, wallet };
}
