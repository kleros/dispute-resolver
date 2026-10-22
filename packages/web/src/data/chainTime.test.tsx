import type { ChainId } from "@dispute-resolver/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { numberToHex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, createTestDeps, createTestQueryClient, type RpcHandler } from "../test/data";
import { ChainClockProvider, Countdown } from "../ui";
import { useChainClockOffset } from "./chainTime";
import { CHAIN_CLOCK_CHECK_MS } from "./constants";
import { shouldPersistQuery } from "./persistence";
import { queryKeys } from "./queryKeys";
import type { CoreDeps } from "./types";

const CHAIN_SECONDS = 1_700_000_000;
const HOUR = 3_600;
const DAY = 86_400;
const SKEW_MS = HOUR * 1_000;
/** A target two days after chain time, as the browser clock an hour ahead reads it. */
const BROWSER_COUNTDOWN = "01d 23h 00m";
const CHAIN_COUNTDOWN = "02d 00h 00m";
const MINUTE_MS = 60_000;

/** Answers the latest block with the timestamp field given at each read, leaving the field out when it is undefined. */
function blockRpc(timestamp: () => string | undefined) {
  return vi.fn<RpcHandler>(({ method }) => {
    if (method !== "eth_getBlockByNumber") throw new Error(`unexpected ${method}`);
    const value = timestamp();
    return { number: "0x10", hash: `0x${"cd".repeat(32)}`, transactions: [], ...(value === undefined ? {} : { timestamp: value }) };
  });
}

/** Answers the latest block with a chain clock one hour behind the (mocked) browser clock; any other request fails. */
function latestBlockRpc() {
  return blockRpc(() => numberToHex(Math.floor((Date.now() - SKEW_MS) / 1_000)));
}

function blockReads(rpc: ReturnType<typeof latestBlockRpc>, chainId: ChainId): number {
  return rpc.mock.calls.filter(([request]) => request.chainId === chainId && request.method === "eth_getBlockByNumber").length;
}

function ChainCountdown({ chainId }: { readonly chainId: ChainId | null }) {
  return (
    <ChainClockProvider offsetMs={useChainClockOffset(chainId)}>
      <Countdown target={CHAIN_SECONDS + 2 * DAY} />
    </ChainClockProvider>
  );
}

function Offset({ chainId }: { readonly chainId: ChainId }) {
  return <output aria-label={`Chain ${String(chainId)}`}>{useChainClockOffset(chainId)}</output>;
}

/**
 * Fakes the browser clock and the intervals, with a monotonic clock that runs with the browser clock but ignores the
 * steps `stepBrowserClock` makes to it, as an operating system's time service does when it corrects the clock.
 */
function fakeClocks() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime((CHAIN_SECONDS + HOUR) * 1_000);
  let stepsMs = 0;
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - stepsMs);
  return {
    stepBrowserClock(byMs: number) {
      stepsMs += byMs;
      vi.setSystemTime(Date.now() + byMs);
    },
    async elapse(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    },
  };
}

function renderWithData(deps: CoreDeps, children: ReactNode) {
  const client = createTestQueryClient();
  const wrap = (content: ReactNode) => (
    <TestDataProvider deps={deps} client={client}>
      {content}
    </TestDataProvider>
  );
  const view = render(wrap(children));
  const rerender = (content: ReactNode) => {
    view.rerender(wrap(content));
  };
  return { client, rerender };
}

beforeEach(() => {
  vi.setSystemTime((CHAIN_SECONDS + HOUR) * 1_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChainClockOffset", () => {
  it("the offset is the latest block's time minus the browser time of the read", async () => {
    const rpc = latestBlockRpc();
    renderWithData(createTestDeps({ rpc }), <Offset chainId={100} />);
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Chain 100" })).toHaveTextContent(String(-SKEW_MS));
    });
    expect(rpc).toHaveBeenCalledWith({ chainId: 100, method: "eth_getBlockByNumber", params: ["latest", false] });
  });

  it("without a block read yet, or when it fails, the offset is 0 and countdowns use the browser clock", async () => {
    renderWithData(createTestDeps({ rpc: () => new Promise(() => undefined) }), <ChainCountdown chainId={1} />);
    expect(screen.getByText(BROWSER_COUNTDOWN)).toBeInTheDocument();
    cleanup();

    const failed = renderWithData(createTestDeps(), <ChainCountdown chainId={1} />);
    await waitFor(() => {
      expect(failed.client.getQueryState(queryKeys.chainTime(1))?.status).toBe("error");
    });
    expect(screen.getByText(BROWSER_COUNTDOWN)).toBeInTheDocument();
    cleanup();

    const rpc = latestBlockRpc();
    renderWithData(
      createTestDeps({ rpc, unconfiguredChains: [1] }),
      <>
        <ChainCountdown chainId={1} />
        <ChainCountdown chainId={null} />
        <Offset chainId={100} />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Chain 100" })).toHaveTextContent(String(-SKEW_MS));
    });
    expect(screen.getAllByText(BROWSER_COUNTDOWN)).toHaveLength(2);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no timestamp", undefined],
    ["a zero timestamp", "0x0"],
    ["a timestamp too large to count in milliseconds", "0xffffffffffffffffffff"],
  ])("a latest block with %s is refused and countdowns keep the browser clock", async (_, timestamp) => {
    const rpc = blockRpc(() => timestamp);
    const { client } = renderWithData(
      createTestDeps({ rpc }),
      <>
        <ChainCountdown chainId={1} />
        <Offset chainId={1} />
      </>,
    );
    await waitFor(() => {
      expect(client.getQueryState(queryKeys.chainTime(1))?.status).toBe("error");
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "Chain 1" })).toHaveTextContent(/^0$/);
    expect(screen.getByText(BROWSER_COUNTDOWN)).toBeInTheDocument();
  });

  it("a refresh that returns a block without a timestamp keeps the last chain offset", async () => {
    let timestamp: string | undefined = numberToHex(CHAIN_SECONDS);
    const rpc = blockRpc(() => timestamp);
    const { client } = renderWithData(
      createTestDeps({ rpc }),
      <>
        <ChainCountdown chainId={1} />
        <Offset chainId={1} />
      </>,
    );
    expect(await screen.findByText(CHAIN_COUNTDOWN)).toBeInTheDocument();

    timestamp = undefined;
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.chainTime(1) });
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(queryKeys.chainTime(1))?.status).toBe("error");
    expect(screen.getByRole("status", { name: "Chain 1" })).toHaveTextContent(String(-SKEW_MS));
    expect(screen.getByText(CHAIN_COUNTDOWN)).toBeInTheDocument();
  });

  it("one latest-block read per chain, shared by every observer and not read again while fresh", async () => {
    const rpc = latestBlockRpc();
    const { rerender } = renderWithData(
      createTestDeps({ rpc }),
      <>
        <Offset key="first" chainId={1} />
        <Offset key="second" chainId={1} />
        <Offset key="gnosis" chainId={100} />
      </>,
    );
    await waitFor(() => {
      for (const output of screen.getAllByRole("status")) expect(output).toHaveTextContent(String(-SKEW_MS));
    });
    expect(blockReads(rpc, 1)).toBe(1);
    expect(blockReads(rpc, 100)).toBe(1);

    rerender(
      <>
        <Offset key="first" chainId={1} />
        <Offset key="second" chainId={1} />
        <Offset key="gnosis" chainId={100} />
        <Offset key="fresh" chainId={1} />
      </>,
    );
    expect(screen.getAllByRole("status", { name: "Chain 1" })).toHaveLength(3);
    expect(blockReads(rpc, 1)).toBe(1);

    vi.setSystemTime((CHAIN_SECONDS + HOUR + 31) * 1_000);
    rerender(<Offset key="stale" chainId={1} />);
    await waitFor(() => {
      expect(blockReads(rpc, 1)).toBe(2);
    });
    expect(blockReads(rpc, 100)).toBe(1);
  });

  it("a countdown inside the chain clock reads chain time once the block arrives", async () => {
    renderWithData(createTestDeps({ rpc: latestBlockRpc() }), <ChainCountdown chainId={1} />);
    expect(screen.getByText(BROWSER_COUNTDOWN)).toBeInTheDocument();
    expect(await screen.findByText(CHAIN_COUNTDOWN)).toBeInTheDocument();
  });

  it("when the browser clock is changed while the page is open, the chain time is read again and countdowns keep chain time", async () => {
    const clocks = fakeClocks();
    let chainSeconds = CHAIN_SECONDS;
    const rpc = blockRpc(() => numberToHex(chainSeconds));
    renderWithData(createTestDeps({ rpc }), <ChainCountdown chainId={1} />);
    expect(await screen.findByText(CHAIN_COUNTDOWN)).toBeInTheDocument();

    // From an hour fast to ten minutes slow: the old offset would now read an hour and ten minutes behind the chain.
    clocks.stepBrowserClock(-(HOUR * 1_000 + 10 * MINUTE_MS));
    chainSeconds += CHAIN_CLOCK_CHECK_MS / 1_000;
    await clocks.elapse(CHAIN_CLOCK_CHECK_MS);
    expect(await screen.findByText("01d 23h 59m")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("after the browser clock is changed, a failed read of the chain time leaves countdowns on the browser clock, not the outdated offset", async () => {
    const clocks = fakeClocks();
    let blockReadsFail = false;
    const rpc = blockRpc(() => {
      if (blockReadsFail) throw new Error("The RPC is down.");
      return numberToHex(CHAIN_SECONDS);
    });
    renderWithData(createTestDeps({ rpc }), <ChainCountdown chainId={1} />);
    expect(await screen.findByText(CHAIN_COUNTDOWN)).toBeInTheDocument();

    blockReadsFail = true;
    clocks.stepBrowserClock(-HOUR * 1_000);
    await clocks.elapse(CHAIN_CLOCK_CHECK_MS);
    expect(await screen.findByText("01d 23h 59m")).toBeInTheDocument();
    expect(rpc.mock.calls.length).toBeGreaterThan(1);
  });

  it("waking from a sleep that stopped the monotonic clock reads the chain time again", async () => {
    const clocks = fakeClocks();
    let chainSeconds = CHAIN_SECONDS;
    const rpc = blockRpc(() => numberToHex(chainSeconds));
    const { client } = renderWithData(createTestDeps({ rpc }), <ChainCountdown chainId={1} />);
    expect(await screen.findByText(CHAIN_COUNTDOWN)).toBeInTheDocument();

    clocks.stepBrowserClock(8 * HOUR * 1_000);
    chainSeconds += 8 * HOUR + CHAIN_CLOCK_CHECK_MS / 1_000;
    await clocks.elapse(CHAIN_CLOCK_CHECK_MS);
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(client.getQueryState(queryKeys.chainTime(1))).toMatchObject({ status: "success", dataUpdateCount: 1 });
    });
    expect(screen.getByText("01d 15h 59m")).toBeInTheDocument();
  });

  it("a browser clock that keeps pace with the monotonic clock never makes the chain time be read again", async () => {
    const clocks = fakeClocks();
    const rpc = latestBlockRpc();
    renderWithData(createTestDeps({ rpc }), <ChainCountdown chainId={1} />);
    expect(await screen.findByText(CHAIN_COUNTDOWN)).toBeInTheDocument();

    await clocks.elapse(10 * CHAIN_CLOCK_CHECK_MS);
    expect(screen.getByText("01d 23h 55m")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("the chain time stays in memory and is never written to the persisted cache", async () => {
    const { client } = renderWithData(createTestDeps({ rpc: latestBlockRpc() }), <Offset chainId={1} />);
    await waitFor(() => {
      expect(client.getQueryState(queryKeys.chainTime(1))?.status).toBe("success");
    });
    const query = client.getQueryCache().find({ queryKey: queryKeys.chainTime(1) });
    if (query === undefined) throw new Error("The chain time was not cached.");
    expect(shouldPersistQuery(query)).toBe(false);
  });
});
