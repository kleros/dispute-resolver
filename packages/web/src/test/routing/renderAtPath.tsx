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

export interface RenderInRouterOptions {
  readonly wallet?: TestWallet;
  readonly wrapper?: ComponentType<{ readonly children?: ReactNode }>;
}

export interface RoutedRenderResult extends RenderResult {
  readonly currentPath: () => string;
}

export function renderInRouter(routes: ReactElement, path: string, options: RenderInRouterOptions = {}): RoutedRenderResult {
  const seen: { location: Location | null } = { location: null };
  const record = (location: Location) => {
    seen.location = location;
  };
  const wrapper = options.wrapper ?? walletWrapper(options.wallet ?? createTestWallet());
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      {routes}
      <LocationProbe onLocation={record} />
    </MemoryRouter>,
    { wrapper },
  );
  return {
    ...result,
    currentPath: () => (seen.location === null ? "" : `${seen.location.pathname}${seen.location.search}${seen.location.hash}`),
  };
}

export interface RenderAtPathOptions extends RenderInRouterOptions {
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
