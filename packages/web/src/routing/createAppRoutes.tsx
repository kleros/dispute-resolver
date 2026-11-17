import { Route, Routes } from "react-router";
import { ChainLayout } from "./ChainLayout";
import { NotFoundScreen } from "./NotFoundScreen";
import { usePageChain, useResolvedChain } from "./pageChain";
import { CASE_ROUTE, CHAIN_PARAM, INTERACT_ROUTE } from "./paths";
import { ChainlessRedirect, InteractRedirect, RedirectToOngoing } from "./redirects";
import type { AppRouteComponents, FrameComponent } from "./types";

/** A URL whose first segment is one of these is a legacy path without a chain. */
const CHAINLESS_PREFIXES = ["ongoing", "create", "cases", "interact", "disputes"] as const;

/** Outside the chain layout (for example `//foo`), so it renders its own frame with the resolved chain. */
function UnmatchedPath({ frame: Frame }: { readonly frame: FrameComponent }) {
  const resolvedChain = useResolvedChain();
  return (
    <Frame resolvedChain={resolvedChain}>
      <NotFoundScreen chainId={resolvedChain.page.chainId} />
    </Frame>
  );
}

function UnmatchedChainPath() {
  return <NotFoundScreen chainId={usePageChain().chainId} />;
}

/** The frame and the pages are injected, so routing never imports shell or the pages. */
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
          <Route path={CASE_ROUTE} element={<CasePage />} />
          <Route path={INTERACT_ROUTE} element={<InteractRedirect />} />
          <Route path="*" element={<UnmatchedChainPath />} />
        </Route>
        <Route path="*" element={<UnmatchedPath frame={PageFrame} />} />
      </Routes>
    );
  };
}
