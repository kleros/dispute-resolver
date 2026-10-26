import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { UserRejectedRequestError } from "viem";
import { describe, expect, it, vi } from "vitest";
import { TestDataProvider, deferred } from "../test/data";
import { renderAtPath } from "../test/routing";
import { renderWithProviders } from "../test/shell";
import {
  TEST_WALLET_SECOND_ACCOUNT,
  UNCONFIGURED_CHAIN_ID,
  createConnectedTestWallet,
  createTestWallet,
  declineNextSwitch,
  holdChainSwitches,
  setWalletStatus,
  walletConnector,
  walletWrapper,
  type TestWallet,
} from "../test/wallet";
import { WalletSetupProvider, useNetworkSwitch, useWallet } from "../wallet";
import { usePageChain } from "./pageChain";

function PageProbe() {
  return <p>Page on {usePageChain().chainId}</p>;
}

function WalletStatusProbe() {
  return <p>Wallet {useWallet().status}</p>;
}

/** A page with in-app links to other chains, the history buttons and another switch control, as the app's pages have. */
function LinkingPage() {
  const navigate = useNavigate();
  const network = useNetworkSwitch();
  return (
    <>
      <PageProbe />
      <Link to="/1/cases/5">Case 5 on Ethereum Mainnet</Link>
      <Link to="/1/ongoing?from=link#list">Ongoing Disputes on Ethereum Mainnet</Link>
      <Link to="/11155111/ongoing">Ongoing Disputes on Sepolia</Link>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Forward
      </button>
      <button type="button" onClick={() => void network.switchTo(100)}>
        Ask the wallet for Gnosis Network
      </button>
    </>
  );
}

/** Records every switch request the app makes, while letting the mock connector carry it out. */
function spyOnSwitches(wallet: TestWallet) {
  return vi.spyOn(walletConnector(wallet), "switchChain");
}

/** The wallet carries out the first switch request and declines every later one, as a user who only meant the first. */
function acceptFirstSwitchOnly(wallet: TestWallet) {
  const connector = walletConnector(wallet);
  const accept = connector.switchChain?.bind(connector);
  if (accept === undefined) throw new Error("The test wallet cannot switch chains.");
  return vi
    .spyOn(connector, "switchChain")
    .mockImplementation(() => Promise.reject(new UserRejectedRequestError(new Error("Declined in the wallet."))))
    .mockImplementationOnce(accept);
}

function notifications() {
  return within(screen.getByRole("region", { name: "Notifications" }));
}

function toastsShown() {
  return [...notifications().queryAllByRole("status"), ...notifications().queryAllByRole("alert")];
}

/** Declines the waiting switch request and lets the app see the refusal. */
async function declineNow(decline: () => void) {
  await act(async () => {
    decline();
    await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function follow(name: string) {
  fireEvent.click(screen.getByRole("link", { name }));
}

function press(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("useChainFollowing: the wallet moves", () => {
  it("a wallet chain change moves the app to that chain without a reload, keeping the path and search", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const view = renderAtPath(<PageProbe />, "/1/ongoing?period=x#h", { wallet });
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    const frameBefore = view.container.querySelector("[data-frame-kind]");
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing?period=x#h");
    // The frame is the same element: the app navigated in place instead of loading again.
    expect(view.container.querySelector("[data-frame-kind]")).toBe(frameBefore);
  });

  it("a wallet chain change on a case page opens the new chain's Ongoing Disputes, not the same number there", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/cases/5?ref=share#e", wallet });
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
    expect(switches).not.toHaveBeenCalled();
    expect(toastsShown()).toEqual([]);
  });

  it.each([
    [UNCONFIGURED_CHAIN_ID, "an unconfigured chain"],
    [690, "a chain no longer supported"],
  ])("a wallet change to chain %i, %s, shows the unsupported-network screen", async (chainId) => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await act(async () => {
      await wallet.changeChain(chainId);
    });
    expect(await screen.findByRole("heading", { name: `Unsupported Network ${String(chainId)}` })).toBeInTheDocument();
    expect(view.currentPath()).toBe(`/${String(chainId)}/ongoing`);
  });

  it("from the unsupported-network screen, a wallet change to a configured chain shows that chain's page", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 137 });
    const view = renderAtPath(<PageProbe />, "/10/ongoing", { wallet });
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("a wallet change on a page whose first segment names no chain replaces that segment instead of keeping it", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const view = renderAtPath(<PageProbe />, "/abc/cases/5?ref=share#e", { wallet });
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/cases/5?ref=share#e");
  });

  it.each([
    ["0", 0],
    ["NaN", Number.NaN],
  ])("a wallet chain ID of %s is ignored: no crash, no navigation, the page stays", async (_label, chainId) => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    act(() => {
      walletConnector(wallet).emitter.emit("change", { chainId });
    });
    await settle();
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
    expect(switches).not.toHaveBeenCalled();
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("disconnecting does not navigate, and reconnecting is a new connection, not a change", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await act(async () => {
      await wallet.disconnect();
    });
    expect(view.currentPath()).toBe("/1/ongoing");
    await act(async () => {
      await wallet.connect();
    });
    expect(view.currentPath()).toBe("/1/ongoing");
  });
});

describe("useChainFollowing: a wallet on another chain than the page's", () => {
  it("at load, a wallet on another chain than the URL's is asked once to switch, and the URL stays", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/cases/5", { wallet });
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
  });

  it("under StrictMode's double effects the load-time switch is still requested once", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const Providers = walletWrapper(wallet);
    function StrictProviders({ children }: { readonly children?: ReactNode }) {
      return (
        <StrictMode>
          <Providers>{children}</Providers>
        </StrictMode>
      );
    }
    renderAtPath(<PageProbe />, "/1/ongoing", { wrapper: StrictProviders });
    await waitFor(() => {
      expect(switches).toHaveBeenCalled();
    });
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
  });

  it("a declined switch at load on a list page moves to the same path on the wallet's chain, asks once and shows one neutral toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/ongoing?period=4#list", wallet });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing?period=4#list");
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    const [toast, ...others] = toastsShown();
    expect(others).toEqual([]);
    expect(notifications().getByRole("status")).toBe(toast);
    expect(toast).toHaveTextContent("Wallet stayed on Gnosis Network");
    expect(toast).toHaveTextContent("The app is now showing Gnosis Network.");
  });

  it("a declined switch at load on a case page opens the wallet chain's Ongoing Disputes and says the dispute is on the other chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const view = renderWithProviders(<PageProbe />, { path: "/1/cases/1621?ref=share#evidence", wallet });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
    expect(notifications().getByRole("status")).toHaveTextContent("Dispute 1621 is on Ethereum Mainnet, so the app is showing Ongoing Disputes on Gnosis Network.");
  });

  it.each(["/1/CASES/5", "/1/%63ases/5"])("a declined switch on the case link %s opens the wallet chain's Ongoing Disputes, not the same number there", async (path) => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const view = renderWithProviders(<PageProbe />, { path, wallet });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
    expect(notifications().getByRole("status")).toHaveTextContent("Dispute 5 is on Ethereum Mainnet, so the app is showing Ongoing Disputes on Gnosis Network.");
  });

  it("a failed switch moves the app to the wallet's chain and shows one error toast with the wallet's reason", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: new Error("Unrecognized chain ID") });
    const view = renderWithProviders(<PageProbe />, { path: "/1/ongoing", wallet });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
    const [toast, ...others] = toastsShown();
    expect(others).toEqual([]);
    expect(toast).toHaveAttribute("role", "alert");
    expect(toast).toHaveTextContent("Network not switched");
    // The wallet's own words come wrapped by viem, so only the app's part of the reason is fixed.
    expect(toast).toHaveTextContent(/Could not switch to Ethereum Mainnet: .+\. The app is now showing Gnosis Network\.$/);
  });

  it("a reconnect of the same wallet is not a new connection, so a declined switch is not asked again", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    // With an injected wallet the built app reconnects twice at load: the connection passes through `reconnecting` and
    // settles again on the same chain.
    setWalletStatus(wallet, "reconnecting");
    setWalletStatus(wallet, "connected");
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("an authorized wallet found by wagmi's mount-time probe on another chain stays disconnected while probed, then is asked for the page chain once", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const authorization = deferred<boolean>();
    vi.spyOn(walletConnector(wallet), "isAuthorized").mockReturnValue(authorization.promise);
    function ProbingProviders({ children }: { readonly children?: ReactNode }) {
      return (
        <TestDataProvider>
          <WalletSetupProvider setup={wallet.setup}>{children}</WalletSetupProvider>
        </TestDataProvider>
      );
    }
    const view = renderAtPath(
      <>
        <PageProbe />
        <WalletStatusProbe />
      </>,
      "/1/ongoing",
      { wrapper: ProbingProviders },
    );
    await waitFor(() => {
      expect(walletConnector(wallet).isAuthorized).toHaveBeenCalled();
    });
    expect(wallet.config.state.status).toBe("connecting");
    expect(screen.getByText("Wallet disconnected")).toBeInTheDocument();
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    await act(async () => {
      authorization.resolve(true);
      await authorization.promise;
    });
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    expect(screen.getByText("Wallet connected")).toBeInTheDocument();
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("the user's first connect on another chain asks for the page chain once and never navigates", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    expect(switches).not.toHaveBeenCalled();
    await act(async () => {
      await wallet.connect();
    });
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("the user's first connect on another chain, declined, moves the app to the wallet's chain", async () => {
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/create", wallet });
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    await act(async () => {
      await wallet.connect();
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/create");
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toHaveLength(1);
  });

  it("a wallet already on the page chain is not asked to switch", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    renderAtPath(<PageProbe />, "/100/ongoing", { wallet });
    await settle();
    expect(switches).not.toHaveBeenCalled();
  });

  it("on the unsupported-network screen nothing is requested at load", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/10/ongoing", { wallet });
    await settle();
    expect(switches).not.toHaveBeenCalled();
    expect(view.currentPath()).toBe("/10/ongoing");
  });

  it("a wallet on an unconfigured chain is asked to switch, and a refusal shows the unsupported-network screen with no toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: UNCONFIGURED_CHAIN_ID, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/cases/5", wallet });
    expect(await screen.findByRole("heading", { name: `Unsupported Network ${String(UNCONFIGURED_CHAIN_ID)}` })).toBeInTheDocument();
    expect(view.currentPath()).toBe(`/${String(UNCONFIGURED_CHAIN_ID)}/ongoing`);
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    expect(toastsShown()).toEqual([]);
  });

  it("a wallet on an unconfigured chain whose switch fails shows the unsupported-network screen and an error toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: UNCONFIGURED_CHAIN_ID, switchChainError: new Error("Unrecognized chain ID") });
    const view = renderWithProviders(<PageProbe />, { path: "/1/ongoing?period=4", wallet });
    expect(await screen.findByRole("heading", { name: `Unsupported Network ${String(UNCONFIGURED_CHAIN_ID)}` })).toBeInTheDocument();
    expect(view.currentPath()).toBe(`/${String(UNCONFIGURED_CHAIN_ID)}/ongoing?period=4`);
    const [toast, ...others] = toastsShown();
    expect(others).toEqual([]);
    expect(toast).toHaveAttribute("role", "alert");
    expect(toast).toHaveTextContent("Network not switched");
    expect(toast).toHaveTextContent(/Could not switch to Ethereum Mainnet: .+\.$/);
    expect(toast).not.toHaveTextContent(/showing/);
  });

  it("the app never asks again after its own fallback move", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/1/cases/5", wallet });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    act(() => {
      wallet.changeAccount(TEST_WALLET_SECOND_ACCOUNT);
    });
    setWalletStatus(wallet, "reconnecting");
    setWalletStatus(wallet, "connected");
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/100/ongoing");
    expect(toastsShown()).toHaveLength(1);
  });
});

describe("useChainFollowing: the URL moves to another chain while a wallet is connected", () => {
  it("a link to the other chain while connected asks the wallet once, and the page stays when it switches", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/100/ongoing", wallet });
    follow("Case 5 on Ethereum Mainnet");
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    expect(toastsShown()).toEqual([]);
  });

  it("an in-app link to the other chain, declined, moves the app back to the wallet's chain with one toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/100/cases", wallet });
    follow("Ongoing Disputes on Ethereum Mainnet");
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing?from=link#list");
    });
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Page on 100")).toBeInTheDocument();
    expect(toastsShown()).toHaveLength(1);
    expect(notifications().getByRole("status")).toHaveTextContent("The app is now showing Gnosis Network.");
  });

  it("back and forward to the other chain ask once per history entry", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/100/ongoing", wallet });
    follow("Case 5 on Ethereum Mainnet");
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    press("Back");
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(100);
    });
    expect(view.currentPath()).toBe("/100/ongoing");
    press("Forward");
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    await settle();
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(switches.mock.calls.map(([parameters]) => parameters.chainId)).toEqual([1, 100, 1]);
  });

  it("after a refusal, back and forward ask nothing more: the refused entry was replaced by the wallet chain's page", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    const switches = spyOnSwitches(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/100/cases", wallet });
    follow("Ongoing Disputes on Ethereum Mainnet");
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing?from=link#list");
    });
    press("Back");
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/cases");
    });
    press("Forward");
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing?from=link#list");
    });
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toHaveLength(1);
  });

  it("while the request waits the page stays on the URL's chain and a further link asks nothing", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    holdChainSwitches(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/1/cases/5", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    follow("Ongoing Disputes on Sepolia");
    await settle();
    expect(view.currentPath()).toBe("/11155111/ongoing");
    expect(screen.getByText("Page on 11155111")).toBeInTheDocument();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toEqual([]);
  });

  it("a link followed while another control's request waits is asked once after that request settles", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const switches = spyOnSwitches(wallet);
    const decline = declineNextSwitch(wallet);
    const view = renderWithProviders(<LinkingPage />, { path: "/1/ongoing", wallet });
    press("Ask the wallet for Gnosis Network");
    follow("Ongoing Disputes on Sepolia");
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/11155111/ongoing");
    await declineNow(decline);
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(11155111);
    });
    await settle();
    expect(switches.mock.calls.map(([parameters]) => parameters.chainId)).toEqual([100, 11155111]);
    expect(view.currentPath()).toBe("/11155111/ongoing");
    expect(toastsShown()).toEqual([]);
  });

  it.each([
    ["/1/ongoing?period=4#list", "/100/ongoing?period=4#list"],
    ["/1/cases/5", "/100/ongoing"],
  ])("a switch another control asks for, once accepted, moves %s to %s without asking the wallet back to the old chain", async (path, target) => {
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const switches = acceptFirstSwitchOnly(wallet);
    const view = renderWithProviders(<LinkingPage />, { path, wallet });
    press("Ask the wallet for Gnosis Network");
    await waitFor(() => {
      expect(view.currentPath()).toBe(target);
    });
    await settle();
    expect(switches.mock.calls.map(([parameters]) => parameters.chainId)).toEqual([100]);
    expect(wallet.config.state.chainId).toBe(100);
    expect(view.currentPath()).toBe(target);
    expect(toastsShown()).toEqual([]);
  });

  it("a wallet that moves on its own while the app's request waits is followed, and the late refusal moves nothing and shows no toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const decline = declineNextSwitch(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/ongoing", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await wallet.changeChain(11155111);
    });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/11155111/ongoing");
    });
    await declineNow(decline);
    await settle();
    expect(view.currentPath()).toBe("/11155111/ongoing");
    expect(screen.getByText("Page on 11155111")).toBeInTheDocument();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toEqual([]);
  });

  it("disconnecting while the request waits moves nothing and shows no toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const decline = declineNextSwitch(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/cases/5", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await wallet.disconnect();
    });
    await declineNow(decline);
    await settle();
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    expect(toastsShown()).toEqual([]);
  });

  it("a refusal that comes while the wallet reconnects moves the app to the wallet's chain once it is back, with one toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const decline = declineNextSwitch(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/cases/5", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    setWalletStatus(wallet, "reconnecting");
    await declineNow(decline);
    await settle();
    setWalletStatus(wallet, "connected");
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toHaveLength(1);
    expect(notifications().getByRole("status")).toHaveTextContent("Dispute 5 is on Ethereum Mainnet");
  });

  it("a refusal that comes while the wallet reconnects, after which the wallet is back on the page chain, moves nothing and shows no toast", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const decline = declineNextSwitch(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/cases/5", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    setWalletStatus(wallet, "reconnecting");
    await declineNow(decline);
    await act(async () => {
      await wallet.changeChain(1);
    });
    setWalletStatus(wallet, "connected");
    await settle();
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toEqual([]);
  });

  it("a refusal that comes after the wallet disconnected and connected again on the same chain still moves the app to the wallet's chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const decline = declineNextSwitch(wallet);
    const view = renderWithProviders(<PageProbe />, { path: "/1/ongoing", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await wallet.disconnect();
    });
    await act(async () => {
      await wallet.connect();
    });
    await declineNow(decline);
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    await settle();
    expect(switches).toHaveBeenCalledTimes(1);
    expect(toastsShown()).toHaveLength(1);
  });
});
