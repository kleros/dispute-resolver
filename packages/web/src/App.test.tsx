import { render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { TestDataProvider } from "./test/data";
import { installOfflineAppKitEnvironment } from "./test/wallet";

// No RPC, no WalletConnect project ID and no Atlas URI, whatever the repository's .env holds: the wallet runs in its
// read-only `unconfigured` mode and the Atlas gate requests nothing (ARCHITECTURE.md §2.2).
vi.mock("./env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env")>();
  return { ...actual, APP_CONFIG: actual.buildAppConfig({}, { host: "localhost:5173", origin: "http://localhost:5173" }) };
});

// The data layer's test double replaces the persisted QueryClient and the real read clients, so every read the pages
// start is answered locally (ARCHITECTURE.md §1.5); the pages' hooks stay the real ones. The double imports `./data`
// itself, so the factory cannot import it; the provider is handed over once the test module has loaded.
const testData = vi.hoisted(() => ({ Provider: null as ComponentType<{ readonly children?: ReactNode }> | null }));

vi.mock("./data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./data")>();
  function TestAppDataProvider({ children }: { readonly children?: ReactNode }) {
    const Provider = testData.Provider;
    if (Provider === null) throw new Error("The data layer's test double is not installed.");
    return <Provider>{children}</Provider>;
  }
  return { ...actual, DataProvider: TestAppDataProvider };
});

testData.Provider = TestDataProvider;

/** Unit tests never touch the network: any fetch fails the test. */
const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error("App test made a network request")));

function renderAppAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

/** The header's navigation, whose links are built from the resolved chain (D-45). */
function mainNavigation(): HTMLElement {
  return screen.getByRole("navigation", { name: "Main" });
}

beforeEach(() => {
  // jsdom lacks the browser surface the library components use (ResizeObserver, matchMedia); the double stubs it.
  installOfflineAppKitEnvironment();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("App: the route table through the provider tree (ADR 0001 URL bullet, ARCHITECTURE.md §2.1, §3.1)", () => {
  it("ADR 0001: /:chainId/ongoing renders the Ongoing page inside the page frame", async () => {
    renderAppAt("/1/ongoing");
    expect(await screen.findByRole("heading", { level: 1, name: "Ongoing Disputes" })).toBeInTheDocument();
    expect(screen.getByTestId("ongoing-page")).toHaveAttribute("data-chain", "1");
    expect(within(mainNavigation()).getByRole("link", { name: /Ongoing Disputes/ })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    { name: "ADR 0001: /:chainId/create renders the Create page by URL, even with no wallet connected", from: "/100/create", page: "create-page", to: "/100/create" },
    { name: "ADR 0001: /:chainId/cases/:id renders the case page for that dispute", from: "/1/cases/5", page: "case-page", to: "/1/cases/5" },
    { name: "ADR 0001: /:chainId/interact/:id redirects to the case page of :id", from: "/1/interact/5", page: "case-page", to: "/1/cases/5" },
    { name: "D-01: / redirects to the default chain's Ongoing page", from: "/", page: "ongoing-page", to: "/1/ongoing" },
    { name: "D-01: /:chainId/disputes redirects to that chain's Ongoing page", from: "/100/disputes", page: "ongoing-page", to: "/100/ongoing" },
    { name: "D-01: a chain-less legacy case link redirects under the default chain", from: "/cases/5", page: "case-page", to: "/1/cases/5" },
  ] as const)("$name", async ({ from, page, to }) => {
    renderAppAt(from);
    expect(await screen.findByTestId(page)).toBeInTheDocument();
    expect(window.location.pathname).toBe(to);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("D-09: /:chainId/cases renders the case page's search state with no dispute loaded", async () => {
    renderAppAt("/1/cases");
    expect(await screen.findByRole("heading", { name: "Find a dispute" })).toBeInTheDocument();
    expect(screen.getByTestId("case-page")).toBeInTheDocument();
  });

  it("D-45: an unconfigured chain shows the unsupported-network screen with header links on the resolved chain", async () => {
    renderAppAt("/424242/ongoing");
    expect(await screen.findByRole("heading", { name: "Unsupported Network 424242" })).toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: /Ongoing Disputes/ })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.queryByTestId("ongoing-page")).not.toBeInTheDocument();
  });

  it("D-45: an unknown path under a configured chain shows the 404 screen inside the frame", async () => {
    renderAppAt("/100/nowhere");
    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: /Ongoing Disputes/ })).toHaveAttribute("href", "/100/ongoing");
  });
});
