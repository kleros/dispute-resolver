import type { Address, Hex, SimulationResult, WriteCall } from "@dispute-resolver/core";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeContract } from "@wagmi/core";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, UserRejectedRequestError, type EIP1193RequestFn } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreDeps, WriteReceipt } from "../data";
import { createTestDeps } from "../test/data";
import {
  TEST_REPLACEMENT_TX_HASH,
  TEST_TX_HASH,
  TEST_WALLET_ACCOUNT,
  createConnectedTestWallet,
  createTestWallet,
  testReceipt,
  testReplacementReceipt,
  testWriteBuild,
  walletConnector,
  walletWrapper,
  type TestWallet,
} from "../test/wallet";
import type { WriteController, WriteOptions, WriteStatus } from "./types";
import { useWrite } from "./useWrite";
import { WriteStatusNotice } from "./WriteStatusNotice";

vi.mock("@wagmi/core", async (importOriginal) => ({ ...(await importOriginal<typeof import("@wagmi/core")>()), writeContract: vi.fn() }));

const writeContractMock = vi.mocked(writeContract);

function renderWrite(
  wallet: TestWallet,
  waitForReceipt: (chainId: number, hash: Hex) => Promise<WriteReceipt> = () => Promise.resolve(testReceipt()),
  simulate?: CoreDeps["simulate"],
) {
  const deps = createTestDeps({ waitForReceipt, ...(simulate === undefined ? {} : { simulate }) });
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

async function writeOnMainnet(waitForReceipt?: (chainId: number, hash: Hex) => Promise<WriteReceipt>, onMined?: WriteOptions["onMined"]) {
  const { result } = renderWrite(await createConnectedTestWallet(), waitForReceipt);
  await act(async () => {
    await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
  });
  return result;
}

function checkAnswering(result: SimulationResult) {
  return vi.fn<(call: WriteCall, from: Address) => Promise<SimulationResult>>(() => Promise.resolve(result));
}

function WriteWithNotice({ onRender }: { readonly onRender: (write: WriteController) => void }) {
  const write = useWrite();
  onRender(write);
  return <WriteStatusNotice status={write.status} />;
}

function renderWriteWithNotice(wallet: TestWallet, simulate?: CoreDeps["simulate"]): () => WriteController {
  const writes: WriteController[] = [];
  render(<WriteWithNotice onRender={(write) => writes.push(write)} />, {
    wrapper: walletWrapper(wallet, createTestDeps({ waitForReceipt: () => Promise.resolve(testReceipt()), ...(simulate === undefined ? {} : { simulate }) })),
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
  it("refuses to check or sign when the wallet is on another chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const simulate = checkAnswering({ status: "ok" });
    const { result } = renderWrite(wallet, undefined, simulate);
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(outcome).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(result.current.status).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(simulate).not.toHaveBeenCalled();
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("the refusal's switch offer moves the wallet, the refusal stays until the retry, and the retry signs on the page chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
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

  it.each([1, 100])("refuses before signing a call built for another chain than the page, with the wallet on chain %i, and offers no switch", async (walletChainId) => {
    const wallet = await createConnectedTestWallet({ chainId: walletChainId });
    const latest = renderWriteWithNotice(wallet);
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await latest().execute(testWriteBuild(100), { pageChainId: 1 });
    });
    expect(outcome).toEqual({ phase: "refused", refusal: "call-chain-mismatch" });
    expect(writeContractMock).not.toHaveBeenCalled();
    expect(screen.getByText("Action unavailable")).toBeInTheDocument();
    expect(screen.getByText(CALL_CHAIN_MISMATCH)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).toBeNull();
  });

  it("a wallet that leaves the page chain between the last check and the signature is refused by the signing library, and nothing is sent", async () => {
    const actual = await vi.importActual<typeof import("@wagmi/core")>("@wagmi/core");
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const connector = walletConnector(wallet);
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

describe("useWrite pre-flight check", () => {
  it("checks the transaction from the connected account before the wallet opens, then signs from that account", async () => {
    const order: string[] = [];
    const simulate = vi.fn<CoreDeps["simulate"]>(() => {
      order.push("check");
      return Promise.resolve({ status: "ok" });
    });
    writeContractMock.mockImplementation(() => {
      order.push("sign");
      return Promise.resolve(TEST_TX_HASH);
    });
    const wallet = await createConnectedTestWallet();
    const { result, statuses } = renderWrite(wallet, undefined, simulate);
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(order).toEqual(["check", "sign"]);
    const build = testWriteBuild(1);
    if (!build.ok) throw new Error("The test build was refused.");
    expect(simulate).toHaveBeenCalledWith(build.call, TEST_WALLET_ACCOUNT.toLowerCase());
    expect(writeContractMock).toHaveBeenCalledWith(wallet.config, expect.objectContaining({ account: TEST_WALLET_ACCOUNT }));
    expect(statuses.at(-1)?.phase).toBe("mined");
  });

  it("a contract rejection sends nothing and quotes the contract's answer as the contract's", async () => {
    const latest = renderWriteWithNotice(await createConnectedTestWallet(), checkAnswering({ status: "reverted", reason: "Appeal period is over." }));
    await act(async () => {
      await latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(latest().status).toEqual({ phase: "refused-by-contract", reason: "Appeal period is over." });
    expect(await screen.findByRole("alert")).toHaveTextContent("The contract would reject this transactionNothing was sent. The contract's answer: “Appeal period is over.”");
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("a rejection without a reason the page may show sends nothing and quotes nothing", async () => {
    const latest = renderWriteWithNotice(await createConnectedTestWallet(), checkAnswering({ status: "reverted", reason: null }));
    await act(async () => {
      await latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(latest().status).toEqual({ phase: "refused-by-contract", reason: null });
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("The contract would reject this transactionNothing was sent.");
    expect(notice).not.toHaveTextContent("answer");
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("a balance too low sends nothing", async () => {
    const latest = renderWriteWithNotice(await createConnectedTestWallet(), checkAnswering({ status: "insufficient-funds" }));
    await act(async () => {
      await latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Balance too lowYour wallet's balance does not cover this transaction. Nothing was sent.");
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "answers that it could not check",
      () => Promise.resolve<SimulationResult>({ status: "unavailable", error: { code: "rpc-error", message: "This network's data is unavailable." } }),
    ],
    ["throws", () => Promise.reject(new Error("socket hang up"))],
  ] as const)("a check that %s still opens the wallet", async (_case, simulate: CoreDeps["simulate"]) => {
    const { result } = renderWrite(await createConnectedTestWallet(), undefined, vi.fn(simulate));
    await act(async () => {
      await result.current.execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
    expect(result.current.status.phase).toBe("mined");
  });

  it("says it is checking while the check runs", async () => {
    let answer: ((result: SimulationResult) => void) | undefined;
    const simulate = vi.fn<CoreDeps["simulate"]>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const latest = renderWriteWithNotice(await createConnectedTestWallet(), simulate);
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(await screen.findByText("Checking the transaction")).toBeInTheDocument();
    expect(screen.getByText("Checking with the contract that it accepts this transaction before your wallet opens.")).toBeInTheDocument();
    expect(writeContractMock).not.toHaveBeenCalled();
    await act(async () => {
      answer?.({ status: "ok" });
      await pending;
    });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["passed", { status: "ok" }],
    ["could not be made", { status: "unavailable", error: { code: "rpc-error", message: "This network's data is unavailable." } }],
  ] as const)("a wallet that switches account during a check that %s sends nothing and says why", async (_case, answer: SimulationResult) => {
    const wallet = await createConnectedTestWallet();
    const simulate = vi.fn<CoreDeps["simulate"]>(() => {
      wallet.changeAccount("0x00000000000000000000000000000000000B0b00");
      return Promise.resolve(answer);
    });
    const latest = renderWriteWithNotice(wallet, simulate);
    await act(async () => {
      await latest().execute(testWriteBuild(1), { pageChainId: 1 });
    });
    expect(latest().status).toEqual({ phase: "account-changed" });
    expect(await screen.findByText("Transaction not sent")).toBeInTheDocument();
    expect(screen.getByText("Your wallet's account changed while the transaction was checked. Nothing was sent. Try again.")).toBeInTheDocument();
    expect(writeContractMock).not.toHaveBeenCalled();
  });
});

describe("useWrite outcomes", () => {
  it("a refused build sends nothing and shows the refusal", async () => {
    const wallet = await createConnectedTestWallet();
    const { result } = renderWrite(wallet);
    await act(async () => {
      await result.current.execute({ ok: false, refusal: "appeal-unsupported" }, { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ phase: "refused", refusal: "appeal-unsupported" });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("checking, then submitted with the explorer link, then mined after onMined ran", async () => {
    const wallet = await createConnectedTestWallet();
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
    expect(statuses.map((status) => status.phase)).toEqual(expect.arrayContaining(["idle", "checking", "submitted", "mined"]));
  });

  it("a rejected signature is not an error", async () => {
    writeContractMock.mockRejectedValue(new UserRejectedRequestError(new Error("User denied transaction signature.")));
    const result = await writeOnMainnet();
    expect(result.current.status).toEqual({ phase: "rejected" });
  });

  it("a wallet error before submission is a failure with its message", async () => {
    writeContractMock.mockRejectedValue(new Error("insufficient funds for gas"));
    const result = await writeOnMainnet();
    expect(result.current.status).toEqual({ phase: "failed", hash: null, explorerUrl: null, message: "insufficient funds for gas" });
  });

  it("the page chain's arbitrator rejecting the call before submission keeps its own reason", async () => {
    const reason = "appeal period is over";
    writeContractMock.mockRejectedValue(
      new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi: [], functionName: "appeal", message: reason }), {
        abi: [],
        functionName: "appeal",
        contractAddress: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
      }),
    );
    const result = await writeOnMainnet();
    expect(result.current.status).toEqual({ phase: "failed", hash: null, explorerUrl: null, message: expect.stringContaining(reason) as unknown });
  });

  it("a reverted receipt is a failure with the hash and explorer link, and onMined does not run", async () => {
    const onMined = vi.fn();
    const result = await writeOnMainnet(() => Promise.resolve(testReceipt(TEST_TX_HASH, "reverted")), onMined);
    expect(result.current.status).toEqual({ phase: "failed", hash: TEST_TX_HASH, explorerUrl: `https://etherscan.io/tx/${TEST_TX_HASH}`, message: "The transaction reverted." });
    expect(onMined).not.toHaveBeenCalled();
  });

  it("a receipt that cannot be read is a failure that keeps the hash", async () => {
    const result = await writeOnMainnet(() => Promise.reject(new Error("No RPC configured for chain 1.")));
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_TX_HASH}`,
      message: "The transaction could not be confirmed: No RPC configured for chain 1.",
    });
  });

  it("the receipt is read through the data layer's configured RPC, on the call's chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const waitForReceipt = vi.fn<(chainId: number, hash: Hex) => Promise<WriteReceipt>>(() => Promise.resolve(testReceipt()));
    const { result } = renderWrite(wallet, waitForReceipt);
    await act(async () => {
      await result.current.execute(testWriteBuild(100), { pageChainId: 100 });
    });
    expect(waitForReceipt).toHaveBeenCalledWith(100, TEST_TX_HASH);
    expect(result.current.status.phase).toBe("mined");
  });

  it.each([
    [
      "a cancelled transaction is a failure shown with the cancelling hash, and nothing is refreshed",
      testReplacementReceipt("cancelled"),
      "The transaction was cancelled in your wallet before it was mined, so it did not take effect.",
    ],
    [
      "a transaction replaced by another operation is a failure",
      testReplacementReceipt("replaced"),
      "The transaction was replaced in your wallet by a different transaction before it was mined, so it did not take effect.",
    ],
    [
      "a receipt of another transaction without replacement details is a failure, never a success",
      testReplacementReceipt(),
      "A different transaction was mined in place of this one, so the Dispute Resolver cannot confirm the action took effect. Check the transaction link; nothing further was sent.",
    ],
  ])("%s", async (_name, receipt, message) => {
    const onMined = vi.fn();
    const result = await writeOnMainnet(() => Promise.resolve(receipt), onMined);
    expect(result.current.status).toEqual({ phase: "failed", hash: TEST_REPLACEMENT_TX_HASH, explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`, message });
    expect(onMined).not.toHaveBeenCalled();
  });

  it("a repriced transaction is mined under its new hash and explorer link", async () => {
    const onMined = vi.fn();
    const repriced = testReplacementReceipt("repriced");
    const result = await writeOnMainnet(() => Promise.resolve(repriced), onMined);
    expect(result.current.status).toEqual({
      phase: "mined",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      receipt: repriced,
    });
    expect(onMined).toHaveBeenCalledWith(repriced);
  });

  it("a repriced transaction that reverts fails under its new hash", async () => {
    const result = await writeOnMainnet(() => Promise.resolve(testReplacementReceipt("repriced", TEST_REPLACEMENT_TX_HASH, "reverted")));
    expect(result.current.status).toEqual({
      phase: "failed",
      hash: TEST_REPLACEMENT_TX_HASH,
      explorerUrl: `https://etherscan.io/tx/${TEST_REPLACEMENT_TX_HASH}`,
      message: "The transaction reverted.",
    });
  });

  it("a refresh that fails after mining still reports the write as mined", async () => {
    const result = await writeOnMainnet(undefined, () => Promise.reject(new Error("refresh failed")));
    expect(result.current.status.phase).toBe("mined");
  });

  it("reset returns to idle", async () => {
    const result = await writeOnMainnet();
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toEqual({ phase: "idle" });
  });
});
