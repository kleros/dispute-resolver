import type { ChainId, Hex } from "@dispute-resolver/core";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeContract } from "@wagmi/core";
import { ChainMismatchError, UserRejectedRequestError, type EIP1193RequestFn } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteReceipt } from "../data";
import { createTestDeps } from "../test/data";
import { TEST_REPLACEMENT_TX_HASH, TEST_TX_HASH, createTestWallet, testReceipt, testReplacementReceipt, testWriteBuild, walletWrapper, type TestWallet } from "../test/wallet";
import type { WriteController, WriteStatus } from "./types";
import { useWrite } from "./useWrite";
import { WriteStatusNotice } from "./WriteStatusNotice";

vi.mock("@wagmi/core", async (importOriginal) => ({ ...(await importOriginal<typeof import("@wagmi/core")>()), writeContract: vi.fn() }));

const writeContractMock = vi.mocked(writeContract);

function renderWrite(wallet: TestWallet, waitForReceipt: (chainId: ChainId, hash: Hex) => Promise<WriteReceipt> = () => Promise.resolve(testReceipt())) {
  const deps = createTestDeps({ waitForReceipt });
  const statuses: WriteStatus[] = [];
  const view = renderHook(
    () => {
      const write = useWrite();
      statuses.push(write.status);
      return write;
    },
    { wrapper: walletWrapper(wallet, deps) },
  );
  return { ...view, statuses };
}

/** A screen in miniature: one `useWrite` with its `WriteStatusNotice` beside it. */
function WriteWithNotice({ onRender }: { readonly onRender: (write: WriteController) => void }) {
  const write = useWrite();
  onRender(write);
  return <WriteStatusNotice status={write.status} />;
}

/** Renders `WriteWithNotice` and returns the latest controller. */
function renderWriteWithNotice(wallet: TestWallet): () => WriteController {
  const writes: WriteController[] = [];
  render(<WriteWithNotice onRender={(write) => writes.push(write)} />, {
    wrapper: walletWrapper(wallet, createTestDeps({ waitForReceipt: () => Promise.resolve(testReceipt()) })),
  });
  return () => {
    const write = writes.at(-1);
    if (write === undefined) throw new Error("WriteWithNotice has not rendered.");
    return write;
  };
}

const CALL_CHAIN_MISMATCH = "This action was prepared for a different network than this page, so nothing was sent.";

beforeEach(() => {
  writeContractMock.mockReset();
  writeContractMock.mockResolvedValue(TEST_TX_HASH);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWrite chain guard", () => {
  it("the controller has no switch or Connect of its own; WriteStatusNotice offers both", () => {
    const { result } = renderWrite(createTestWallet());
    expect(Object.keys(result.current).sort((a, b) => a.localeCompare(b))).toEqual(["execute", "reset", "status"]);
  });

  it("refuses to sign when the wallet is on another chain", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const { result } = renderWrite(wallet);
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(outcome).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(result.current.status).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("the refusal's switch offer moves the wallet, the refusal stays until the retry, and the retry signs on the page chain", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const latest = renderWriteWithNotice(wallet);
    await act(async () => {
      await latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    await userEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    expect(await screen.findByText("Your wallet is now on Ethereum Mainnet. Try again.")).toBeInTheDocument();
    expect(latest().status).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(writeContractMock).not.toHaveBeenCalled();
    await act(async () => {
      await latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
    expect(writeContractMock).toHaveBeenCalledWith(wallet.config, expect.objectContaining({ chainId: 1 }));
    expect(latest().status.phase).toBe("mined");
  });

  it("a wallet that changed chain after the page loaded is refused, not signed for", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await wallet.changeChain(100);
    });
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("refuses before signing a call built for another chain than the page, even with the wallet on the page chain", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const latest = renderWriteWithNotice(wallet);
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await latest().execute(testWriteBuild(100), { pageChainId: 1 });
    });
    expect(outcome).toEqual({ phase: "refused", refusal: "call-chain-mismatch" });
    expect(writeContractMock).not.toHaveBeenCalled();
    expect(screen.getByText("Action unavailable")).toBeInTheDocument();
    expect(screen.getByText(CALL_CHAIN_MISMATCH)).toBeInTheDocument();
  });

  it("refuses a call built for the wallet's chain while the page is on another one, without offering a switch", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const latest = renderWriteWithNotice(wallet);
    await act(async () => {
      await latest().execute(testWriteBuild(100), { pageChainId: 1 });
    });
    expect(latest().status).toEqual({ phase: "refused", refusal: "call-chain-mismatch" });
    expect(writeContractMock).not.toHaveBeenCalled();
    expect(screen.getByText(CALL_CHAIN_MISMATCH)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).toBeNull();
  });

  it("a wallet that leaves the page chain between the last check and the signature is refused by the signing library, and nothing is sent", async () => {
    const actual = await vi.importActual<typeof import("@wagmi/core")>("@wagmi/core");
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const [connector] = wallet.config.connectors;
    if (connector === undefined) throw new Error("The test wallet has no connector.");
    const methods: string[] = [];
    const getProvider = connector.getProvider.bind(connector);
    vi.spyOn(connector, "getProvider").mockImplementation(async (parameters) => {
      const provider = (await getProvider(parameters)) as { readonly request: EIP1193RequestFn };
      const request: EIP1193RequestFn = (args, options) => {
        methods.push(args.method);
        return provider.request(args, options);
      };
      return { ...provider, request };
    });
    writeContractMock.mockImplementation(async (config, parameters) => {
      await wallet.changeChain(100);
      return actual.writeContract(config, parameters);
    });
    const { result } = renderWrite(wallet);
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(outcome).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    // Both methods are answered by the mock connector itself; any other one would go out to the chain's RPC.
    expect(methods).toContain("eth_chainId");
    expect(methods.filter((method) => method !== "eth_chainId" && method !== "wallet_switchEthereumChain")).toEqual([]);
  });

  it("a chain change during signing that wagmi rejects ends as a wrong-chain refusal", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    writeContractMock.mockImplementation(async () => {
      await wallet.changeChain(100);
      throw new ChainMismatchError({ chain: mainnet, currentChainId: 100 });
    });
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
  });

  it("needs a wallet when none is connected, and keeps the page chain for the Connect offer", async () => {
    const wallet = createTestWallet();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(100), { pageChainId: 100 });
    });
    expect(result.current.status).toEqual({ phase: "needs-wallet", pageChainId: 100 });
    expect(writeContractMock).not.toHaveBeenCalled();
  });
});

describe("useWrite outcomes", () => {
  it("a refused build sends nothing and shows the refusal", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute({ ok: false, refusal: "appeal-unsupported" }, { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "refused", refusal: "appeal-unsupported" });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("pending, then submitted with the explorer link, then mined after onMined ran", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    let releaseReceipt: ((receipt: WriteReceipt) => void) | undefined;
    const receiptPromise = new Promise<WriteReceipt>((resolve) => {
      releaseReceipt = resolve;
    });
    const { result, statuses } = renderWrite(wallet, () => receiptPromise);
    const order: string[] = [];
    const onMined = vi.fn(() => {
      order.push(`onMined while ${result.current.status.phase}`);
    });
    let pendingWrite: Promise<unknown> = Promise.resolve();
    act(() => {
      pendingWrite = result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    await waitFor(() => {
      expect(result.current.status).toEqual({ phase: "submitted", hash: TEST_TX_HASH, explorerUrl: `https://etherscan.io/tx/${TEST_TX_HASH}` });
    });
    expect(onMined).not.toHaveBeenCalled();
    await act(async () => {
      releaseReceipt?.(testReceipt());
      await pendingWrite;
    });
    expect(order).toEqual(["onMined while submitted"]);
    expect(result.current.status).toEqual({ phase: "mined", hash: TEST_TX_HASH, explorerUrl: `https://etherscan.io/tx/${TEST_TX_HASH}`, receipt: testReceipt() });
    expect(statuses.map((status) => status.phase)).toEqual(expect.arrayContaining(["idle", "pending", "submitted", "mined"]));
  });

  it("a rejected signature is not an error", async () => {
    writeContractMock.mockRejectedValue(new UserRejectedRequestError(new Error("User denied transaction signature.")));
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "rejected" });
  });

  it("an EIP-1193 4001 deep in the cause chain is a rejection too", async () => {
    writeContractMock.mockRejectedValue(new Error("Contract call failed.", { cause: Object.assign(new Error("denied"), { code: 4001 }) }));
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "rejected" });
  });

  it("a wallet error before submission is a failure with its message", async () => {
    writeContractMock.mockRejectedValue(new Error("insufficient funds for gas"));
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "failed", hash: null, explorerUrl: null, message: "insufficient funds for gas" });
  });

  it("a reverted receipt is a failure with the hash and explorer link, and onMined does not run", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderWrite(wallet, () => Promise.resolve(testReceipt(TEST_TX_HASH, "reverted")));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({ phase: "failed", hash: TEST_TX_HASH, explorerUrl: `https://etherscan.io/tx/${TEST_TX_HASH}`, message: "The transaction reverted." });
    expect(onMined).not.toHaveBeenCalled();
  });

  it("a receipt that cannot be read is a failure that keeps the hash", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet, () => Promise.reject(new Error("No RPC configured for chain 1.")));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_TX_HASH}`,
      message: "The transaction could not be confirmed: No RPC configured for chain 1.",
    });
  });

  it("the receipt is read through the data layer's configured RPC, on the call's chain", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const waitForReceipt = vi.fn<(chainId: ChainId, hash: Hex) => Promise<WriteReceipt>>(() => Promise.resolve(testReceipt()));
    const { result } = renderWrite(wallet, waitForReceipt);
    await act(async () => {
      await result.current.execute(testWriteBuild(100), { pageChainId: 100 });
    });
    expect(waitForReceipt).toHaveBeenCalledWith(100, TEST_TX_HASH);
    expect(result.current.status.phase).toBe("mined");
  });

  it("a cancelled transaction is a failure shown with the cancelling hash, and nothing is refreshed", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderWrite(wallet, () => Promise.resolve(testReplacementReceipt("cancelled")));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      message: "The transaction was cancelled in your wallet before it was mined, so it did not take effect.",
    });
    expect(onMined).not.toHaveBeenCalled();
  });

  it("a transaction replaced by another operation is a failure", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderWrite(wallet, () => Promise.resolve(testReplacementReceipt("replaced")));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      message: "The transaction was replaced in your wallet by a different transaction before it was mined, so it did not take effect.",
    });
    expect(onMined).not.toHaveBeenCalled();
  });

  it("a receipt of another transaction without replacement details is a failure, never a success", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderWrite(wallet, () => Promise.resolve(testReplacementReceipt()));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      message:
        "A different transaction was mined in place of this one, so the Dispute Resolver cannot confirm the action took effect. Check the transaction link; nothing further was sent.",
    });
    expect(onMined).not.toHaveBeenCalled();
  });

  it("a repriced transaction is mined under its new hash and explorer link", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const repriced = testReplacementReceipt("repriced");
    const { result } = renderWrite(wallet, () => Promise.resolve(repriced));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({
      phase: "mined",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      receipt: repriced,
    });
    expect(onMined).toHaveBeenCalledWith(repriced);
  });

  it("a repriced transaction that reverts fails under its new hash", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet, () => Promise.resolve(testReplacementReceipt("repriced", TEST_REPLACEMENT_TX_HASH, "reverted")));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      message: "The transaction reverted.",
    });
  });

  it("a refresh that fails after mining still reports the write as mined", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined: () => Promise.reject(new Error("refresh failed")) });
    });
    expect(result.current.status.phase).toBe("mined");
  });

  it("reset returns to idle", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toEqual({ phase: "idle" });
  });
});
