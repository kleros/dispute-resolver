import { render, renderHook, screen } from "@testing-library/react";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { useContext, type ComponentType, type ReactNode } from "react";
import { useInRouterContext, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConfig, WagmiContext } from "wagmi";
import { buildAppConfig, type AppConfig } from "../env";
import { TestDataProvider } from "../test/data";
import { expectRenderErrors } from "../test/shell";
import { createColorSchemeStore } from "../theme";
import { AppProviders } from "./AppProviders";
import { useColorScheme } from "./colorScheme";
import type { PageScroll } from "./pageScroll";
import { useToast } from "./ToastProvider";
import type { ConfiguredProvider } from "./types";

/** No WalletConnect project ID and no Atlas URI: the `unconfigured` wallet mode, so nothing reaches a network. */
const CONFIG: AppConfig = buildAppConfig({}, { host: "localhost:5173", origin: "http://localhost:5173" });

const order: string[] = [];

function useRecordLayer(name: string): void {
  const query = useContext(QueryClientContext) !== undefined;
  const wagmi = useContext(WagmiContext) !== undefined;
  const router = useInRouterContext();
  order.push(`${name} query:${String(query)} wagmi:${String(wagmi)} router:${String(router)}`);
}

function recorded<P extends object>(name: string, Component: ComponentType<P>) {
  return function Recorded(props: P) {
    useRecordLayer(name);
    return <Component {...props} />;
  };
}

vi.mock("../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../wallet")>();
  return { ...actual, WalletProvider: recorded("wallet", actual.WalletProvider) };
});

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, BrowserRouter: recorded("router", actual.BrowserRouter) };
});

vi.mock("./ToastProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ToastProvider")>();
  return { ...actual, ToastProvider: recorded("toasts", actual.ToastProvider) };
});

vi.mock("./ChainNoticeToasts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ChainNoticeToasts")>();
  return { ...actual, ChainNoticeToasts: recorded("chain notices", actual.ChainNoticeToasts) };
});

vi.mock("./colorScheme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./colorScheme")>();
  return { ...actual, ColorSchemeProvider: recorded("colour scheme", actual.ColorSchemeProvider) };
});

interface ProviderProps {
  readonly config: AppConfig;
  readonly children?: ReactNode;
}

function DataProbe({ config, children }: ProviderProps) {
  expect(config).toBe(CONFIG);
  useRecordLayer("data");
  return <TestDataProvider>{children}</TestDataProvider>;
}

function AtlasProbe({ config, children }: ProviderProps) {
  expect(config).toBe(CONFIG);
  useRecordLayer("atlas");
  return <>{children}</>;
}

function BrokenData(): never {
  throw new Error("data layer failed");
}

function RouteProbe() {
  const location = useLocation();
  useToast();
  useColorScheme();
  useConfig();
  useQueryClient();
  useRecordLayer("routes");
  return <p>Routes at {location.pathname}</p>;
}

function renderApp(dataProvider: ConfiguredProvider, children: ReactNode, pageScroll: PageScroll = "document") {
  return render(
    <AppProviders
      config={CONFIG}
      dataProvider={dataProvider}
      atlasGate={AtlasProbe}
      colorScheme={createColorSchemeStore({ root: document.createElement("div"), media: null, storage: null })}
      pageScroll={pageScroll}
    >
      {children}
    </AppProviders>,
  );
}

function pageScrollerContent(): Element | null {
  return document.querySelector(".dr-page-scroller .simplebar-content-wrapper > .simplebar-content");
}

afterEach(() => {
  order.length = 0;
  vi.restoreAllMocks();
});

describe("AppProviders", () => {
  it("composes data, wallet, atlas, router, toasts, chain notices and the colour scheme in that order around the routes, with no page scroller where the document scrolls", () => {
    renderApp(DataProbe, <RouteProbe />);
    expect(screen.getByText("Routes at /")).toBeInTheDocument();
    expect(document.querySelector(".dr-page-scroller")).toBeNull();
    expect(order.slice(0, 8)).toEqual([
      "data query:false wagmi:false router:false",
      "wallet query:true wagmi:false router:false",
      "atlas query:true wagmi:true router:false",
      "router query:true wagmi:true router:false",
      "toasts query:true wagmi:true router:true",
      "chain notices query:true wagmi:true router:true",
      "colour scheme query:true wagmi:true router:true",
      "routes query:true wagmi:true router:true",
    ]);
  });

  it.each<{ pageScroll: PageScroll; inScroller: boolean }>([
    { pageScroll: "document", inScroller: false },
    { pageScroll: "container", inScroller: true },
  ])("the root boundary is outermost: a failing provider keeps the minimal frame, in the page scroller where there is one ($pageScroll)", ({ pageScroll, inScroller }) => {
    expectRenderErrors();
    renderApp(BrokenData, <RouteProbe />, pageScroll);
    const heading = screen.getByRole("heading", { level: 1, name: "Something went wrong" });
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(pageScrollerContent()?.contains(heading) ?? false).toBe(inScroller);
  });

  it("where the page scroller scrolls the page, the routes render inside it", () => {
    renderApp(DataProbe, <RouteProbe />, "container");
    expect(pageScrollerContent()).toContainElement(screen.getByText("Routes at /"));
  });
});

describe("useColorScheme", () => {
  it("useColorScheme outside the provider is a programming error", () => {
    expectRenderErrors();
    expect(() => renderHook(() => useColorScheme())).toThrow("useColorScheme must be used inside ColorSchemeProvider.");
  });
});
