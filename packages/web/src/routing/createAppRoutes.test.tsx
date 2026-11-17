import { act, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { useParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { APP_ROUTE_PATTERNS, TestFrame, renderInRouter } from "../test/routing";
import { UNCONFIGURED_CHAIN_ID, createConnectedTestWallet, createTestWallet, type TestWallet } from "../test/wallet";
import { createAppRoutes } from "./createAppRoutes";
import { usePageChain } from "./pageChain";

function OngoingStub() {
  return <p>Ongoing page on {usePageChain().chainId}</p>;
}

function CreateStub() {
  return <p>Create page on {usePageChain().chainId}</p>;
}

function CaseStub() {
  const { id } = useParams();
  return (
    <p>
      Case page on {usePageChain().chainId} for {id ?? "no ID"}
    </p>
  );
}

const AppRoutes = createAppRoutes({ PageFrame: TestFrame, OngoingPage: OngoingStub, CreatePage: CreateStub, CasePage: CaseStub });

function renderApp(path: string, wallet?: TestWallet) {
  return renderInRouter(createElement(AppRoutes), path, { wallet });
}

function frame(container: HTMLElement) {
  const element = container.querySelector("[data-frame-kind]");
  return {
    kind: element?.getAttribute("data-frame-kind") ?? null,
    chain: element?.getAttribute("data-frame-chain") ?? null,
    segment: element?.getAttribute("data-frame-segment") ?? null,
  };
}

describe("route table: redirects", () => {
  it.each<[string, number | null, number]>([
    ["the default chain's Ongoing page without a wallet", null, 1],
    ["the connected wallet's chain when it is configured", 100, 100],
    ["the default chain when the wallet is on an unconfigured chain", UNCONFIGURED_CHAIN_ID, 1],
  ])("/ goes to %s", async (_name, walletChainId, chainId) => {
    const wallet = walletChainId === null ? undefined : await createConnectedTestWallet({ chainId: walletChainId });
    const view = renderApp("/", wallet);
    expect(await screen.findByText(`Ongoing page on ${String(chainId)}`)).toBeInTheDocument();
    expect(view.currentPath()).toBe(`/${String(chainId)}/ongoing`);
  });

  it("/ waits for wagmi's reconnect to settle, so a returning user lands on their wallet's chain", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    wallet.config.setState((state) => ({ ...state, status: "reconnecting" }));
    const view = renderApp("/", wallet);
    expect(view.currentPath()).toBe("/");
    expect(screen.queryByText(/Ongoing page/)).not.toBeInTheDocument();
    await act(async () => {
      await wallet.connect();
    });
    expect(await screen.findByText("Ongoing page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("/ does not wait while wagmi probes the wallets of a visitor who never connected", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    wallet.config.setState((state) => ({ ...state, status: "connecting" }));
    const view = renderApp("/", wallet);
    expect(await screen.findByText("Ongoing page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("/ waits for AppKit when a connection is stored, so a returning wallet lands on its own chain", () => {
    const view = renderApp("/", createTestWallet({ pendingReconnect: true }));
    expect(view.currentPath()).toBe("/");
    expect(screen.queryByText(/Ongoing page/)).not.toBeInTheDocument();
  });

  it.each(["/1", "/1/", "/1/disputes", "/1/disputes/"])("%s goes to /1/ongoing", async (path) => {
    const view = renderApp(path);
    expect(await screen.findByText("Ongoing page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("/:chainId keeps the URL's chain, whatever the wallet's chain", async () => {
    const view = renderApp("/137/disputes", await createConnectedTestWallet({ chainId: 100 }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/137/ongoing");
    });
  });

  it.each([
    ["/ongoing", "/1/ongoing"],
    ["/create", "/1/create"],
    ["/cases", "/1/cases"],
    ["/cases/", "/1/cases/"],
    ["/cases/5", "/1/cases/5"],
    ["/cases/5?ref=share#evidence", "/1/cases/5?ref=share#evidence"],
    ["/interact/5", "/1/cases/5"],
    ["/interact/5/appeal", "/1/cases/5"],
    ["/disputes", "/1/ongoing"],
  ])("the chain-less legacy path %s goes to %s", async (path, target) => {
    const view = renderApp(path);
    await waitFor(() => {
      expect(view.currentPath()).toBe(target);
    });
    expect(screen.queryByText("404")).not.toBeInTheDocument();
  });

  it("a chain-less legacy path goes to the connected wallet's chain", async () => {
    const view = renderApp("/cases/5", await createConnectedTestWallet({ chainId: 100 }));
    expect(await screen.findByText("Case page on 100 for 5")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/cases/5");
  });

  it.each([
    ["/1/interact/5", "/1/cases/5"],
    ["/1/interact/5/", "/1/cases/5"],
    ["/100/interact/12/anything/else", "/100/cases/12"],
  ])("the interact link %s goes to %s, whatever follows the ID", async (path, target) => {
    const view = renderApp(path);
    await waitFor(() => {
      expect(view.currentPath()).toBe(target);
    });
  });

  it("an interact link whose ID does not parse shows the not-found state in place, without navigating", async () => {
    const view = renderApp("/100/interact/5x/appeal");
    expect(await screen.findByRole("heading", { name: "Dispute with ID 5x does not exist on this network." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
    expect(screen.queryByText(/^Case page/)).toBeNull();
    expect(view.currentPath()).toBe("/100/interact/5x/appeal");
    expect(frame(view.container).chain).toBe("100");
  });

  it("the raw segment of an unparseable interact ID is shown as text only", async () => {
    const segment = '<img src=x onerror="alert(1)">';
    const view = renderApp(`/1/interact/${encodeURIComponent(segment)}`);
    expect(await screen.findByRole("heading", { name: `Dispute with ID ${segment} does not exist on this network.` })).toBeInTheDocument();
    expect(view.container.querySelector("img[onerror]")).toBeNull();
    const hrefs = [...view.container.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toEqual(["/1/ongoing"]);
    expect(view.currentPath()).toBe(`/1/interact/${encodeURIComponent(segment)}`);
  });
});

describe("route table: pages", () => {
  it.each([
    ["/1/ongoing", "Ongoing page on 1"],
    ["/1/ongoing/", "Ongoing page on 1"],
    ["/100/create", "Create page on 100"],
    ["/100/create/", "Create page on 100"],
    ["/1/cases", "Case page on 1 for no ID"],
    ["/1/cases/", "Case page on 1 for no ID"],
    ["/11155111/cases/42/", "Case page on 11155111 for 42"],
  ])("%s shows the %s, without a wallet", (path, page) => {
    renderApp(path);
    expect(screen.getByText(page)).toBeInTheDocument();
  });

  it("pages render inside the frame with the page chain", () => {
    const view = renderApp("/100/ongoing");
    expect(frame(view.container)).toEqual({ kind: "page", chain: "100", segment: null });
  });
});

describe("route table: 404 and unsupported network", () => {
  it.each(["/1/unknown", "/1/ongoing/extra", "/1/cases/5/extra", "/1/interact", "/1/create/x"])("%s is the 404 screen inside the frame", (path) => {
    const view = renderApp(path);
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    expect(view.container.querySelector("img[alt='']")?.getAttribute("src")).toMatch(/acropolis/);
    expect(frame(view.container)).toEqual({ kind: "page", chain: "1", segment: null });
  });

  it("the 404 screen of an unknown path under a configured chain links to that chain's Ongoing Disputes", () => {
    renderApp("/100/nowhere");
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
  });

  it.each(["//foo", "//1/ongoing"])(
    "%s, whose first segment is empty, is the 404 screen inside the frame, linking to the default chain's Ongoing Disputes without a wallet",
    (path) => {
      const view = renderApp(path);
      expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
      expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
      expect(frame(view.container)).toEqual({ kind: "fallback", chain: "1", segment: null });
      expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    },
  );

  it("the 404 screen of a path with an empty first segment uses the connected wallet's configured chain for its frame and its link", async () => {
    const view = renderApp("//foo", await createConnectedTestWallet({ chainId: 100 }));
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(frame(view.container)).toEqual({ kind: "fallback", chain: "100", segment: null });
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
  });

  it.each(["/10/ongoing", "/10/cases/5", "/index.html", "/foo/bar"])("the unconfigured chain of %s shows the unsupported-network screen", (path) => {
    renderApp(path);
    const segment = path.split("/")[1] ?? "";
    expect(screen.getByRole("heading", { name: `Unsupported Network ${segment}` })).toBeInTheDocument();
  });

  it.each(["/01/ongoing", "/1.0/ongoing", "/%201/ongoing", "/0x1/ongoing", "/99999999999999999999/ongoing"])("%s is not read as chain 1", (path) => {
    renderApp(path);
    expect(screen.getByRole("heading", { name: /^Unsupported Network / })).toBeInTheDocument();
    expect(screen.queryByText(/Ongoing page/)).not.toBeInTheDocument();
  });

  it("the URL segment is shown as text, never as markup", () => {
    const view = renderApp("/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E/ongoing");
    expect(screen.getByRole("heading", { name: "Unsupported Network <img src=x onerror=alert(1)>" })).toBeInTheDocument();
    expect(view.container.querySelector("img[onerror]")).toBeNull();
  });
});

describe("route table: Netlify app route patterns", () => {
  /** A concrete path for a Netlify pattern: `:chain` is chain 1 and `*` is dispute 5. */
  function samplePath(pattern: string): string {
    return pattern.replaceAll(":chain", "1").replaceAll("*", "5");
  }

  it.each(APP_ROUTE_PATTERNS.filter((pattern) => pattern !== "/index.html"))("the app route pattern %s is served by the app, never the 404", async (pattern) => {
    renderApp(samplePath(pattern));
    expect(await screen.findByText(/^(Ongoing|Create|Case) page on 1/)).toBeInTheDocument();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
  });
});

describe("usePageChain", () => {
  it("refuses to run outside the /:chainId layout", () => {
    function Outside() {
      usePageChain();
      return null;
    }
    // React reports the thrown render error through console.error and jsdom's error event; both are expected here.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const silence = (event: ErrorEvent) => {
      event.preventDefault();
    };
    window.addEventListener("error", silence);
    try {
      expect(() => renderInRouter(<Outside />, "/")).toThrow("usePageChain is called outside the /:chainId layout of a configured chain.");
    } finally {
      window.removeEventListener("error", silence);
      consoleError.mockRestore();
    }
  });
});
