import { Route, Routes } from "react-router";
import { ChainLayout } from "./ChainLayout";
import { NotFoundScreen } from "./NotFoundScreen";
import { CHAIN_PARAM, useResolvedChain } from "./pageChain";
import { ChainlessRedirect, InteractRedirect, RedirectToOngoing } from "./redirects";
import type { AppRouteComponents, FrameComponent } from "./types";

/** First segments of today's pages: a URL starting with one of them is a chain-less legacy path (D-01). */
const CHAINLESS_PREFIXES = ["ongoing", "create", "cases", "interact", "disputes"] as const;

/**
 * The 404 screen for a path no other route matches, such as one whose first segment is empty (`//foo`): the frame uses
 * the resolved chain, which falls back to the wallet's configured chain or the default chain (spec §1.2, D-45).
 */
function UnmatchedPath({ frame: Frame }: { readonly frame: FrameComponent }) {
  return (
    <Frame resolvedChain={useResolvedChain()}>
      <NotFoundScreen />
    </Frame>
  );
}

/**
 * The route table of ARCHITECTURE.md §3.1. `AppRoutes.tsx` calls it once at module load with shell's frame and the
 * pages; routing never imports either (§1.3).
 *
 * - `/` and chain-less paths go to the default chain (D-01) once the wallet has settled.
 * - `/:chainId`, `/:chainId/disputes` go to the Ongoing page; `/:chainId/interact/:id/*` to the case page.
 * - `/:chainId/cases` is the case page without a dispute (D-09); `/:chainId/cases/:id` the case page of `:id`.
 * - An unconfigured `:chainId` shows the unsupported-network screen; any other path under a configured chain the 404
 *   screen, both inside the frame with the resolved chain (D-45). A path that matches nothing else (an empty first
 *   segment) is the 404 screen too.
 */
export function createAppRoutes({ PageFrame, OngoingPage, CreatePage, CasePage }: AppRouteComponents) {
  return function AppRoutes() {
    return (
      <Routes>
        <Route index element={<RedirectToOngoing />} />
        {CHAINLESS_PREFIXES.map((prefix) => (
          <Route key={prefix} path={`${prefix}/*`} element={<ChainlessRedirect />} />
        ))}
        <Route path={`:${CHAIN_PARAM}`} element={<ChainLayout frame={PageFrame} />}>
          <Route index element={<RedirectToOngoing />} />
          <Route path="disputes" element={<RedirectToOngoing />} />
          <Route path="ongoing" element={<OngoingPage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="cases/:id?" element={<CasePage />} />
          <Route path="interact/:id/*" element={<InteractRedirect />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
        <Route path="*" element={<UnmatchedPath frame={PageFrame} />} />
      </Routes>
    );
  };
}
