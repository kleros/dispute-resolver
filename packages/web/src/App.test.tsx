import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { TestDataProvider } from "./test/data";
import { installOfflineAppKitEnvironment } from "./test/wallet";
import { createColorSchemeStore } from "./theme";

// No RPC, no WalletConnect project ID and no Atlas URI, whatever the repository's .env holds: the wallet runs in its
// read-only `unconfigured` mode and the Atlas gate requests nothing.
vi.mock("./env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env")>();
  return { ...actual, APP_CONFIG: actual.buildAppConfig({}, { host: "localhost:5173", origin: "http://localhost:5173" }) };
});

// The data layer's test double replaces the persisted QueryClient and the real read clients, so every read the pages
// start is answered locally; the pages' hooks stay the real ones. The double imports `./data`
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
  // A detached root per render, so one test's theme choice never reaches the next.
  const root = document.createElement("div");
  const colorScheme = createColorSchemeStore({ root, media: null, storage: null });
  window.history.replaceState(null, "", path);
  return { ...render(<App colorScheme={colorScheme} pageScroll="document" />), root };
}

/** What each page shows first, whatever its data: the Ongoing heading, the Create steps, the case page's search. */
const PAGE_LANDMARKS = {
  ongoing: () => screen.findByRole("heading", { level: 1, name: "Ongoing Disputes" }),
  create: () => screen.findByRole("navigation", { name: "Create dispute steps" }),
  case: () => screen.findByRole("search", { name: "Search by dispute ID" }),
} as const;

/** The header's navigation, whose links are built from the resolved chain. */
function mainNavigation(): HTMLElement {
  return screen.getByRole("navigation", { name: "Main" });
}

/** The banner around the main navigation, since jsdom also gives a page's own `header` the banner role. */
function appHeader(): HTMLElement {
  const header = screen.getAllByRole("banner").find((banner) => within(banner).queryByRole("navigation", { name: "Main" }) !== null);
  if (header === undefined) throw new Error("The app header is not rendered.");
  return header;
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

describe("App routes through the provider tree", () => {
  it("/:chainId/ongoing renders the Ongoing page inside the page frame", async () => {
    renderAppAt("/1/ongoing");
    expect(await PAGE_LANDMARKS.ongoing()).toBeInTheDocument();
    expect(window.location.pathname).toBe("/1/ongoing");
    expect(within(appHeader()).getByText("Ethereum Mainnet")).toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: /Ongoing Disputes/ })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    { name: "/:chainId/create renders the Create page by URL, even with no wallet connected", from: "/100/create", page: "create", to: "/100/create" },
    { name: "/:chainId/cases/:id renders the case page for that dispute", from: "/1/cases/5", page: "case", to: "/1/cases/5" },
    { name: "/:chainId/interact/:id redirects to the case page of :id", from: "/1/interact/5", page: "case", to: "/1/cases/5" },
    { name: "/ redirects to the default chain's Ongoing page", from: "/", page: "ongoing", to: "/1/ongoing" },
    { name: "/:chainId/disputes redirects to that chain's Ongoing page", from: "/100/disputes", page: "ongoing", to: "/100/ongoing" },
    { name: "a chain-less legacy case link redirects under the default chain", from: "/cases/5", page: "case", to: "/1/cases/5" },
  ] as const)("$name", async ({ from, page, to }) => {
    renderAppAt(from);
    expect(await PAGE_LANDMARKS[page]()).toBeInTheDocument();
    expect(window.location.pathname).toBe(to);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("/:chainId/cases renders the case page's search state with no dispute loaded", async () => {
    renderAppAt("/1/cases");
    expect(await screen.findByRole("heading", { name: "Find a dispute" })).toBeInTheDocument();
    expect(screen.getByRole("search", { name: "Search by dispute ID" })).toBeInTheDocument();
  });

  it("an unconfigured chain shows the unsupported-network screen with header links on the resolved chain", async () => {
    renderAppAt("/424242/ongoing");
    expect(await screen.findByRole("heading", { name: "Unsupported Network 424242" })).toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: /Ongoing Disputes/ })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.queryByRole("heading", { level: 1, name: "Ongoing Disputes" })).not.toBeInTheDocument();
  });

  it("an unknown path under a configured chain shows the 404 screen inside the frame", async () => {
    renderAppAt("/100/nowhere");
    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: /Ongoing Disputes/ })).toHaveAttribute("href", "/100/ongoing");
  });

  it("switches the page to the dark theme from the header's toggle and back", async () => {
    const user = userEvent.setup();
    const { root } = renderAppAt("/1/ongoing");
    await PAGE_LANDMARKS.ongoing();
    await user.click(within(appHeader()).getByRole("button", { name: "Switch to dark theme" }));
    expect(root).toHaveClass("dark");
    await user.click(within(appHeader()).getByRole("button", { name: "Switch to light theme" }));
    expect(root).not.toHaveClass("dark");
  });
});
