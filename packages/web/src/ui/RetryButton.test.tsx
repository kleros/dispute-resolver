import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../test/data";
import { setterCalls } from "../test/stateSetters";
import { RetryButton } from "./RetryButton";

vi.mock("react", async (importOriginal) => {
  const { countingSetters } = await import("../test/stateSetters");
  return countingSetters(await importOriginal());
});

type Held = ReturnType<typeof deferred<undefined>>;

function retryButton(): HTMLElement {
  return screen.getByRole("button", { name: "Retry Timeline" });
}

/** The library's busy symbol, drawn only while the button is loading. */
function loadingSymbol(): Element | null {
  return retryButton().querySelector(".button-loading");
}

describe("RetryButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setterCalls.watching = false;
    setterCalls.count = 0;
  });

  it("is busy from the press while its re-read is pending, keeping its accessible name and focus", async () => {
    const read = deferred<undefined>();
    render(<RetryButton label="Retry Timeline" onRetry={() => read.promise} small />);
    expect(retryButton()).not.toHaveAttribute("aria-disabled");
    expect(loadingSymbol()).toBeNull();

    await userEvent.setup().click(retryButton());

    expect(loadingSymbol()).not.toBeNull();
    expect(retryButton()).toHaveAttribute("aria-disabled", "true");
    expect(retryButton()).toHaveFocus();
    expect(retryButton()).toHaveAttribute("data-pending", "true");
  });

  it("cannot be pressed again while its re-read is pending", async () => {
    const read = deferred<undefined>();
    const onRetry = vi.fn(() => read.promise);
    render(<RetryButton label="Retry Timeline" onRetry={onRetry} />);
    const user = userEvent.setup();

    await user.click(retryButton());
    await user.click(retryButton());
    await user.keyboard("{Enter}");

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "resolves",
      (read: Held) => {
        read.resolve(undefined);
      },
    ],
    [
      "rejects",
      (read: Held) => {
        read.reject(new Error("socket hang up"));
      },
    ],
  ] as const)("is idle and can be pressed again once its re-read %s", async (_name, settle) => {
    const first = deferred<undefined>();
    const onRetry = vi.fn<() => Promise<unknown>>().mockReturnValueOnce(first.promise).mockReturnValue(deferred<undefined>().promise);
    render(<RetryButton label="Retry Timeline" onRetry={onRetry} small />);
    const user = userEvent.setup();
    await user.click(retryButton());
    expect(loadingSymbol()).not.toBeNull();

    await act(async () => {
      settle(first);
      await first.promise.catch(() => undefined);
    });

    expect(loadingSymbol()).toBeNull();
    expect(retryButton()).not.toHaveAttribute("aria-disabled");
    expect(retryButton()).toHaveFocus();
    await user.click(retryButton());
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(retryButton()).toHaveAttribute("aria-disabled", "true");
  });

  it.each([
    [
      "resolves",
      (read: Held) => {
        read.resolve(undefined);
      },
    ],
    [
      "rejects",
      (read: Held) => {
        read.reject(new Error("socket hang up"));
      },
    ],
  ] as const)("unmounted while its re-read is pending, updates no state when the re-read later %s", async (_name, settle) => {
    const error = vi.spyOn(console, "error");
    const read = deferred<undefined>();
    const { unmount } = render(<RetryButton label="Retry Timeline" onRetry={() => read.promise} />);
    await userEvent.setup().click(retryButton());

    unmount();
    setterCalls.watching = true;
    await act(async () => {
      settle(read);
      await read.promise.catch(() => undefined);
    });

    expect(setterCalls.count).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });
});
