import { render, renderHook, screen } from "@testing-library/react";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { useContext, type ReactNode } from "react";
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

/** No WalletConnect project ID and no Atlas URI: the read-only `unconfigured` wallet mode, nothing reaches a network. */
const CONFIG: AppConfig = buildAppConfig({}, { host: "localhost:5173", origin: "http://localhost:5173" });

/** Each layer of the tree, in render order, with the contexts already provided above it. */
const order: string[] = [];

/** Records a layer with the QueryClient, wagmi config and router it can see from where it sits in the tree. */
function useRecordLayer(name: string): void {
  const query = useContext(QueryClientContext) !== undefined;
  const wagmi = useContext(WagmiContext) !== undefined;
  const router = useInRouterContext();
  order.push(`${name} query:${String(query)} wagmi:${String(wagmi)} router:${String(router)}`);
}

vi.mock("../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../wallet")>();
  function RecordedWalletProvider(props: Readonly<Parameters<typeof actual.WalletProvider>[0]>) {
    useRecordLayer("wallet");
    return <actual.WalletProvider {...props} />;
  }
  return { ...actual, WalletProvider: RecordedWalletProvider };
});

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  function RecordedBrowserRouter(props: Readonly<Parameters<typeof actual.BrowserRouter>[0]>) {
    useRecordLayer("router");
    return <actual.BrowserRouter {...props} />;
  }
  return { ...actual, BrowserRouter: RecordedBrowserRouter };
});

vi.mock("./ToastProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ToastProvider")>();
  function RecordedToastProvider(props: Readonly<Parameters<typeof actual.ToastProvider>[0]>) {
    useRecordLayer("toasts");
    return <actual.ToastProvider {...props} />;
  }
  return { ...actual, ToastProvider: RecordedToastProvider };
});

vi.mock("./ChainNoticeToasts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ChainNoticeToasts")>();
  function RecordedChainNoticeToasts(props: Readonly<Parameters<typeof actual.ChainNoticeToasts>[0]>) {
    useRecordLayer("chain notices");
    return <actual.ChainNoticeToasts {...props} />;
  }
  return { ...actual, ChainNoticeToasts: RecordedChainNoticeToasts };
});

vi.mock("./colorScheme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./colorScheme")>();
  function RecordedColorSchemeProvider(props: Readonly<Parameters<typeof actual.ColorSchemeProvider>[0]>) {
    useRecordLayer("colour scheme");
    return <actual.ColorSchemeProvider {...props} />;
  }
  return { ...actual, ColorSchemeProvider: RecordedColorSchemeProvider };
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

/** The Atlas gate sits below the QueryClient and the wagmi config it needs. */
function AtlasProbe({ config, children }: ProviderProps) {
  expect(config).toBe(CONFIG);
  useRecordLayer("atlas");
  return <>{children}</>;
}

function BrokenData(): never {
  throw new Error("data layer failed");
}

/** Routing, toasts, the colour scheme, wagmi and the QueryClient are all reachable from the routes. */
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

/** The content of the page scroller, the library's ScrollbarContainer. */
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

  it("the root boundary is outermost, so a failing provider keeps the minimal frame", () => {
    expectRenderErrors();
    renderApp(BrokenData, <RouteProbe />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("where the page scroller scrolls the page, the routes render inside it", () => {
    renderApp(DataProbe, <RouteProbe />, "container");
    expect(pageScrollerContent()).toContainElement(screen.getByText("Routes at /"));
  });

  it("where the page scroller scrolls the page, the minimal frame of a failure renders inside it too", () => {
    expectRenderErrors();
    renderApp(BrokenData, <RouteProbe />, "container");
    expect(pageScrollerContent()).toContainElement(screen.getByRole("heading", { level: 1, name: "Something went wrong" }));
  });
});

describe("useColorScheme", () => {
  it("useColorScheme outside the provider is a programming error", () => {
    expectRenderErrors();
    expect(() => renderHook(() => useColorScheme())).toThrow("useColorScheme must be used inside ColorSchemeProvider.");
  });
});
