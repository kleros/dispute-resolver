import { chainCapabilities } from "@dispute-resolver/core";
import { render, type RenderResult } from "@testing-library/react";
import { useEffect, type ComponentType, type ReactElement, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation, type Location } from "react-router";
import { ChainLayout, type FrameProps, type PageChain } from "../../routing";
import { testChain } from "../data";
import { createTestWallet, walletWrapper, type TestWallet } from "../wallet";

export function testPageChain(chainId: number): PageChain {
  const chain = testChain(chainId);
  return { chainId: chain.id, chain, capabilities: chainCapabilities(chain) };
}

/**
 * A frame that renders only its children and writes the resolved chain on a wrapper element:
 * `data-frame-kind` (`page` | `fallback`), `data-frame-chain` and, on the fallback, `data-frame-segment`.
 */
export function TestFrame({ resolvedChain, children }: FrameProps) {
  return (
    <div
      data-frame-kind={resolvedChain.kind}
      data-frame-chain={resolvedChain.page.chainId}
      data-frame-segment={resolvedChain.kind === "fallback" ? (resolvedChain.unsupportedSegment ?? undefined) : undefined}
    >
      {children}
    </div>
  );
}

function LocationProbe({ onLocation }: { readonly onLocation: (location: Location) => void }) {
  const location = useLocation();
  useEffect(() => {
    onLocation(location);
  }, [location, onLocation]);
  return null;
}

interface RenderInRouterOptions {
  readonly wallet?: TestWallet;
  readonly wrapper?: ComponentType<{ readonly children?: ReactNode }>;
}

export interface RoutedRenderResult extends RenderResult {
  readonly currentPath: () => string;
}

/**
 * The router sits above the caller's providers, so a provider that follows the route (the shell's write toasts) finds
 * it, and both stay RTL's `wrapper`: `rerender` keeps the router's state and the providers. The location probe is part
 * of the wrapper, so a rerendered screen keeps it.
 */
export function renderInRouter(routes: ReactElement, path: string, options: RenderInRouterOptions = {}): RoutedRenderResult {
  const seen: { location: Location | null } = { location: null };
  const record = (location: Location) => {
    seen.location = location;
  };
  const Providers = options.wrapper ?? walletWrapper(options.wallet ?? createTestWallet());
  function RouterAndProviders({ children }: { readonly children?: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Providers>{children}</Providers>
        <LocationProbe onLocation={record} />
      </MemoryRouter>
    );
  }
  const result = render(routes, { wrapper: RouterAndProviders });
  return {
    ...result,
    currentPath: () => (seen.location === null ? "" : `${seen.location.pathname}${seen.location.search}${seen.location.hash}`),
  };
}

interface RenderAtPathOptions extends RenderInRouterOptions {
  readonly frame?: ComponentType<FrameProps>;
}

/** Renders `ui` at `path` under the app's `/:chainId` layout; an unconfigured chain shows the unsupported-network screen. */
export function renderAtPath(ui: ReactElement, path: string, options: RenderAtPathOptions = {}): RoutedRenderResult {
  return renderInRouter(
    <Routes>
      <Route path=":chainId" element={<ChainLayout frame={options.frame ?? TestFrame} />}>
        <Route index element={ui} />
        <Route path="*" element={ui} />
      </Route>
    </Routes>,
    path,
    options,
  );
}
