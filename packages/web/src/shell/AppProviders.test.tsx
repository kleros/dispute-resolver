import { render, renderHook, screen } from "@testing-library/react";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { useContext, type ReactNode } from "react";
import { useInRouterContext, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConfig, WagmiContext } from "wagmi";
import { buildAppConfig, type AppConfig } from "../env";
import { TestDataProvider } from "../test/data";
import { createColorSchemeStore } from "../theme";
import { AppProviders } from "./AppProviders";
import { useColorScheme } from "./colorScheme";
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

/** jsdom reports each error React rethrows in development; the report is expected here. */
function silenceErrorReport(event: ErrorEvent): void {
  event.preventDefault();
}

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

function renderApp(dataProvider: ConfiguredProvider, children: ReactNode) {
  return render(
    <AppProviders
      config={CONFIG}
      dataProvider={dataProvider}
      atlasGate={AtlasProbe}
      colorScheme={createColorSchemeStore({ root: document.createElement("div"), media: null, storage: null })}
    >
      {children}
    </AppProviders>,
  );
}

afterEach(() => {
  window.removeEventListener("error", silenceErrorReport);
  order.length = 0;
  vi.restoreAllMocks();
});

describe("AppProviders", () => {
  it("composes data, wallet, atlas, router, toasts, chain notices and the colour scheme in that order around the routes", () => {
    renderApp(DataProbe, <RouteProbe />);
    expect(screen.getByText("Routes at /")).toBeInTheDocument();
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
    // React logs every caught render error; the log is expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("error", silenceErrorReport);
    renderApp(BrokenData, <RouteProbe />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("useColorScheme", () => {
  it("useColorScheme outside the provider is a programming error", () => {
    // React logs the thrown render error; the log is expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("error", silenceErrorReport);
    expect(() => renderHook(() => useColorScheme())).toThrow("useColorScheme must be used inside ColorSchemeProvider.");
  });
});
