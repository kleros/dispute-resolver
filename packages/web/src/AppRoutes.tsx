import { lazy, Suspense, type ComponentType } from "react";
import { createAppRoutes } from "./routing";
import { PageFrame } from "./shell";
import { SectionSkeleton, type SectionSkeletonProps } from "./ui";

/**
 * A page loaded in its own chunk the first time its route renders, so the initial bundle holds only the providers, the
 * frame and the route table. The fallback renders inside the page frame (`ChainLayout`'s outlet), so the header and
 * footer stay painted while the chunk loads.
 */
function lazyPage(load: () => Promise<ComponentType>, skeleton: SectionSkeletonProps["variant"]): ComponentType {
  const Page = lazy(async () => ({ default: await load() }));
  return function LazyPage() {
    return (
      <Suspense fallback={<SectionSkeleton variant={skeleton} />}>
        <Page />
      </Suspense>
    );
  };
}

export const AppRoutes = createAppRoutes({
  PageFrame,
  OngoingPage: lazyPage(async () => (await import("./pages/ongoing")).OngoingPage, "grid"),
  CreatePage: lazyPage(async () => (await import("./pages/create")).CreatePage, "card"),
  CasePage: lazyPage(async () => (await import("./pages/case")).CasePage, "card"),
});
