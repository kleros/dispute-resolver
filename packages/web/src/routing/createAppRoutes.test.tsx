import { act, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { useParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { TestFrame, renderInRouter } from "../test/routing";
import { UNCONFIGURED_CHAIN_ID, createTestWallet, type TestWallet } from "../test/wallet";
import { createAppRoutes } from "./createAppRoutes";
import { usePageChain } from "./pageChain";
import { APP_ROUTE_PATTERNS } from "./paths";

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

async function connectedWallet(chainId: number): Promise<TestWallet> {
  const wallet = createTestWallet({ chainId });
  await wallet.connect();
  return wallet;
}

describe("route table: redirects (D-01, ARCHITECTURE.md §3.1)", () => {
  it("D-01: / goes to the default chain's Ongoing page without a wallet", async () => {
    const view = renderApp("/");
    expect(await screen.findByText("Ongoing page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("D-01: / goes to the connected wallet's chain when it is configured", async () => {
    const view = renderApp("/", await connectedWallet(100));
    expect(await screen.findByText("Ongoing page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("D-01: / goes to the default chain when the wallet is on an unconfigured chain", async () => {
    const view = renderApp("/", await connectedWallet(UNCONFIGURED_CHAIN_ID));
    expect(await screen.findByText("Ongoing page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("D-01: / waits for wagmi's reconnect to settle, so a returning user lands on their wallet's chain", async () => {
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

  it.each(["/1", "/1/", "/1/disputes", "/1/disputes/"])("D-01: %s goes to /1/ongoing", async (path) => {
    const view = renderApp(path);
    expect(await screen.findByText("Ongoing page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("D-01: /:chainId keeps the URL's chain, whatever the wallet's chain", async () => {
    const view = renderApp("/137/disputes", await connectedWallet(100));
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
  ])("D-01: the chain-less legacy path %s goes to %s", async (path, target) => {
    const view = renderApp(path);
    await waitFor(() => {
      expect(view.currentPath()).toBe(target);
    });
    expect(screen.queryByText("404")).not.toBeInTheDocument();
  });

  it("D-01: a chain-less legacy path goes to the connected wallet's chain", async () => {
    const view = renderApp("/cases/5", await connectedWallet(100));
    expect(await screen.findByText("Case page on 100 for 5")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/cases/5");
  });

  it.each([
    ["/1/interact/5", "/1/cases/5"],
    ["/1/interact/5/", "/1/cases/5"],
    ["/100/interact/12/anything/else", "/100/cases/12"],
  ])("spec §1.2: %s goes to %s (prefix match)", async (path, target) => {
    const view = renderApp(path);
    await waitFor(() => {
      expect(view.currentPath()).toBe(target);
    });
  });

  it("P-11, A19: an interact link whose ID does not parse shows the not-found state in place, without navigating", async () => {
    const view = renderApp("/100/interact/5x/appeal");
    expect(await screen.findByRole("heading", { name: "Dispute with ID 5x does not exist on this network." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
    expect(screen.queryByText(/^Case page/)).toBeNull();
    expect(view.currentPath()).toBe("/100/interact/5x/appeal");
    expect(frame(view.container).chain).toBe("100");
  });

  it("P-11, A19: the raw segment of an unparseable interact ID is shown as text only", async () => {
    const segment = '<img src=x onerror="alert(1)">';
    const view = renderApp(`/1/interact/${encodeURIComponent(segment)}`);
    expect(await screen.findByRole("heading", { name: `Dispute with ID ${segment} does not exist on this network.` })).toBeInTheDocument();
    expect(view.container.querySelector("img[onerror]")).toBeNull();
    const hrefs = [...view.container.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toEqual(["/1/ongoing"]);
    expect(view.currentPath()).toBe(`/1/interact/${encodeURIComponent(segment)}`);
  });
});

describe("route table: pages (spec §1.2, D-09)", () => {
  it.each(["/1/ongoing", "/1/ongoing/"])("spec §1.2: %s is the Ongoing page", (path) => {
    renderApp(path);
    expect(screen.getByText("Ongoing page on 1")).toBeInTheDocument();
  });

  it.each(["/100/create", "/100/create/"])("spec §4.1: %s is the Create page, reachable by URL without a wallet", (path) => {
    renderApp(path);
    expect(screen.getByText("Create page on 100")).toBeInTheDocument();
  });

  it.each(["/1/cases", "/1/cases/"])("D-09: %s is the case page with no dispute ID", (path) => {
    renderApp(path);
    expect(screen.getByText("Case page on 1 for no ID")).toBeInTheDocument();
  });

  it("spec §1.2: /:chainId/cases/:id is the case page of that ID", () => {
    renderApp("/11155111/cases/42/");
    expect(screen.getByText("Case page on 11155111 for 42")).toBeInTheDocument();
  });

  it("D-45: pages render inside the frame with the page chain", () => {
    const view = renderApp("/100/ongoing");
    expect(frame(view.container)).toEqual({ kind: "page", chain: "100", segment: null });
  });
});

describe("route table: 404 and unsupported network (spec §2.5, spec §2.6, D-18, D-45)", () => {
  it.each(["/1/unknown", "/1/ongoing/extra", "/1/cases/5/extra", "/1/interact", "/1/create/x"])("spec §2.6: %s is the 404 screen inside the frame", (path) => {
    const view = renderApp(path);
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    expect(frame(view.container)).toEqual({ kind: "page", chain: "1", segment: null });
  });

  it.each(["//foo", "//1/ongoing"])("R-02 (spec §1.2, D-45): %s, whose first segment is empty, is the 404 screen inside the frame", (path) => {
    const view = renderApp(path);
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    expect(frame(view.container)).toEqual({ kind: "fallback", chain: "1", segment: null });
  });

  it("R-02 (D-45): the 404 frame of a path with an empty first segment uses the connected wallet's configured chain", async () => {
    const view = renderApp("//foo", await connectedWallet(100));
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(frame(view.container)).toEqual({ kind: "fallback", chain: "100", segment: null });
  });

  it.each(["/10/ongoing", "/10/cases/5", "/index.html", "/foo/bar"])("D-18: the unconfigured chain of %s shows the unsupported-network screen", (path) => {
    renderApp(path);
    const segment = path.split("/")[1] ?? "";
    expect(screen.getByRole("heading", { name: `Unsupported Network ${segment}` })).toBeInTheDocument();
  });

  it.each(["/01/ongoing", "/1.0/ongoing", "/%201/ongoing", "/0x1/ongoing", "/99999999999999999999/ongoing"])(
    "A19: %s is not chain 1: only core's parseChainId reads the URL's chain",
    (path) => {
      renderApp(path);
      expect(screen.getByRole("heading", { name: /^Unsupported Network / })).toBeInTheDocument();
      expect(screen.queryByText(/Ongoing page/)).not.toBeInTheDocument();
    },
  );

  it("D-45: the unsupported-network screen's frame uses the default chain and keeps the segment", () => {
    const view = renderApp("/10/ongoing");
    expect(frame(view.container)).toEqual({ kind: "fallback", chain: "1", segment: "10" });
  });

  it("D-45: the unsupported-network screen's frame uses the connected wallet's configured chain", async () => {
    const view = renderApp("/10/ongoing", await connectedWallet(100));
    expect(frame(view.container)).toEqual({ kind: "fallback", chain: "100", segment: "10" });
  });

  it("spec §2.5: the URL segment is shown as text, never as markup", () => {
    const view = renderApp("/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E/ongoing");
    expect(screen.getByRole("heading", { name: "Unsupported Network <img src=x onerror=alert(1)>" })).toBeInTheDocument();
    expect(view.container.querySelector("img[onerror]")).toBeNull();
  });
});

describe("route table: C1 patterns (ARCHITECTURE.md §3.1, §10.4)", () => {
  /** A concrete path for a Netlify pattern: `:chain` is chain 1 and `*` is dispute 5. */
  function samplePath(pattern: string): string {
    return pattern.replace(":chain", "1").replace("*", "5");
  }

  it.each(APP_ROUTE_PATTERNS.filter((pattern) => pattern !== "/index.html"))("C1: the app route pattern %s is served by the app, never the 404", async (pattern) => {
    renderApp(samplePath(pattern));
    expect(await screen.findByText(/^(Ongoing|Create|Case) page on 1/)).toBeInTheDocument();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
  });

  it("C1: /index.html is served by the app, which reads its first segment as a chain (spec §1.3)", () => {
    renderApp("/index.html");
    expect(screen.getByRole("heading", { name: "Unsupported Network index.html" })).toBeInTheDocument();
  });
});

describe("usePageChain", () => {
  it("ARCHITECTURE.md §3.2: refuses to run outside the /:chainId layout", () => {
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
