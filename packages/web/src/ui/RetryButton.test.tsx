import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { deferred } from "../test/data";
import { RetryButton } from "./RetryButton";

type Held = ReturnType<typeof deferred<undefined>>;

function retryButton(): HTMLElement {
  return screen.getByRole("button", { name: "Retry Timeline" });
}

/** The library's busy symbol, drawn only while the button is loading. */
function loadingSymbol(): Element | null {
  return retryButton().querySelector(".button-loading");
}

describe("RetryButton", () => {
  it("cannot be pressed again while its re-read is pending", async () => {
    const read = deferred<undefined>();
    const onRetry = vi.fn(() => read.promise);
    render(<RetryButton label="Retry Timeline" onRetry={onRetry} />);
    const user = userEvent.setup();

    act(() => {
      retryButton().click();
      retryButton().click();
    });
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
  ] as const)("is busy from the press, keeping its accessible name and focus, and is idle and can be pressed again once its re-read %s", async (_name, settle) => {
    const first = deferred<undefined>();
    const onRetry = vi.fn<() => Promise<unknown>>().mockReturnValueOnce(first.promise).mockReturnValue(deferred<undefined>().promise);
    render(<RetryButton label="Retry Timeline" onRetry={onRetry} small />);
    const user = userEvent.setup();
    expect(retryButton()).not.toHaveAttribute("aria-disabled");
    expect(loadingSymbol()).toBeNull();
    await user.click(retryButton());
    expect(loadingSymbol()).not.toBeNull();
    expect(retryButton()).toHaveAttribute("aria-disabled", "true");
    expect(retryButton()).toHaveFocus();
    expect(retryButton()).toHaveAttribute("data-pending", "true");

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
});
