import { chainCapabilities, getChain, type ChainId } from "@dispute-resolver/core";
import { render, type RenderResult } from "@testing-library/react";
import { useEffect, type ComponentType, type ReactElement, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation, type Location } from "react-router";
import { ChainLayout, type FrameProps, type PageChain } from "../../routing";
import { createTestWallet, walletWrapper, type TestWallet } from "../wallet";

/** The page chain of a configured chain, as `usePageChain()` returns it under `/:chainId` (ARCHITECTURE.md §1.5). */
export function testPageChain(chainId: ChainId): PageChain {
  const chain = getChain(chainId);
  if (chain === undefined) throw new Error(`testPageChain: chain ${String(chainId)} is not configured.`);
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

/** Reports the router's location after every navigation. */
function LocationProbe({ onLocation }: { readonly onLocation: (location: Location) => void }) {
  const location = useLocation();
  useEffect(() => {
    onLocation(location);
  }, [location, onLocation]);
  return null;
}

export interface RenderInRouterOptions {
  /** The wallet behind the default wrapper; defaults to a disconnected `createTestWallet()`. */
  readonly wallet?: TestWallet;
  /** Providers around the router; replaces the default `walletWrapper(wallet)` (shell's `renderWithProviders` passes its own). */
  readonly wrapper?: ComponentType<{ readonly children?: ReactNode }>;
}

export interface RoutedRenderResult extends RenderResult {
  /** The router's current location: `pathname + search + hash`. */
  readonly currentPath: () => string;
}

/** Renders `routes` in a `MemoryRouter` that starts at `path`, keeping the router's location readable. */
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

/**
 * Renders `ui` at `path` under the app's `/:chainId` layout (ARCHITECTURE.md §1.5): `usePageChain()`,
 * `useResolvedChain()` and chain following behave as in the app, and an unconfigured chain shows the
 * unsupported-network screen. The frame is `TestFrame`.
 */
export function renderAtPath(ui: ReactElement, path: string, options: RenderInRouterOptions = {}): RoutedRenderResult {
  return renderInRouter(
    <Routes>
      <Route path=":chainId" element={<ChainLayout frame={TestFrame} />}>
        <Route index element={ui} />
        <Route path="*" element={ui} />
      </Route>
    </Routes>,
    path,
    options,
  );
}
