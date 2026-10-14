import { render, screen } from "@testing-library/react";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { useContext, type ReactNode } from "react";
import { useInRouterContext, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConfig, WagmiContext } from "wagmi";
import { buildAppConfig, type AppConfig } from "../env";
import { TestDataProvider } from "../test/data";
import { AppProviders } from "./AppProviders";
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

/** The Atlas gate sits below the QueryClient and the wagmi config it needs (ARCHITECTURE.md §2.1). */
function AtlasProbe({ config, children }: ProviderProps) {
  expect(config).toBe(CONFIG);
  useRecordLayer("atlas");
  return <>{children}</>;
}

function BrokenData(): never {
  throw new Error("data layer failed");
}

/** Routing, toasts, wagmi and the QueryClient are all reachable from the routes. */
function RouteProbe() {
  const location = useLocation();
  useToast();
  useConfig();
  useQueryClient();
  useRecordLayer("routes");
  return <p>Routes at {location.pathname}</p>;
}

function renderApp(dataProvider: ConfiguredProvider, children: ReactNode) {
  return render(
    <AppProviders config={CONFIG} dataProvider={dataProvider} atlasGate={AtlasProbe}>
      {children}
    </AppProviders>,
  );
}

afterEach(() => {
  window.removeEventListener("error", silenceErrorReport);
  order.length = 0;
  vi.restoreAllMocks();
});

describe("AppProviders (ARCHITECTURE.md §2.1)", () => {
  it("SHELL-1 §2.1: composes data, wallet, atlas, router and toasts in that order around the routes", () => {
    renderApp(DataProbe, <RouteProbe />);
    expect(screen.getByText("Routes at /")).toBeInTheDocument();
    expect(order.slice(0, 6)).toEqual([
      "data query:false wagmi:false router:false",
      "wallet query:true wagmi:false router:false",
      "atlas query:true wagmi:true router:false",
      "router query:true wagmi:true router:false",
      "toasts query:true wagmi:true router:true",
      "routes query:true wagmi:true router:true",
    ]);
  });

  it("§2.1: the root boundary is outermost, so a failing provider keeps the minimal frame", () => {
    // React logs every caught render error; the log is expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("error", silenceErrorReport);
    renderApp(BrokenData, <RouteProbe />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
