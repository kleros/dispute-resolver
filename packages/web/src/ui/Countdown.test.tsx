import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChainClockProvider } from "./clock";
import { Countdown } from "./Countdown";
import { formatDuration } from "./duration";

const NOW_SECONDS = 1_700_000_000;
const DAY = 86_400;
const HOUR = 3_600;
const MINUTE = 60;

describe("formatDuration", () => {
  it.each([
    [0, "00d 00h 00m"],
    [59, "00d 00h 00m"],
    [MINUTE, "00d 00h 01m"],
    [DAY + 2 * HOUR + 3 * MINUTE + 59, "01d 02h 03m"],
    [123 * DAY, "123d 00h 00m"],
    [-5 * MINUTE, "00d 00h 00m"],
    [Number.NaN, "00d 00h 00m"],
    [Number.POSITIVE_INFINITY, "00d 00h 00m"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("formats a bigint duration and clamps a negative one to zero", () => {
    expect(formatDuration(5n * BigInt(DAY) + 12n * BigInt(HOUR))).toBe("05d 12h 00m");
    expect(formatDuration(-1n)).toBe("00d 00h 00m");
  });
});

describe("Countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the time left as DDd HHh MMm in a time element", () => {
    render(<Countdown target={NOW_SECONDS + 2 * DAY + 5 * HOUR + 7 * MINUTE + 30} />);
    const countdown = screen.getByText("02d 05h 07m");
    expect(countdown.tagName).toBe("TIME");
    expect(countdown).toHaveAttribute("datetime", "P2DT5H7M");
  });

  it("updates on a 30 second tick", () => {
    render(<Countdown target={NOW_SECONDS + 3 * MINUTE + 30} />);
    const countdown = screen.getByText("00d 00h 03m");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(countdown).toHaveTextContent("00d 00h 03m");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(countdown).toHaveTextContent("00d 00h 02m");
  });

  it("shows zeros once the target has passed", () => {
    render(<Countdown target={NOW_SECONDS - HOUR} />);
    expect(screen.getByText("00d 00h 00m")).toBeInTheDocument();
  });

  it("every countdown shares one clock, stopped when the last one unmounts", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(
      <>
        <Countdown target={NOW_SECONDS + DAY} />
        <Countdown target={NOW_SECONDS + 2 * DAY} />
        <Countdown target={NOW_SECONDS + 3 * DAY} />
      </>,
    );
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("a countdown mounted after the clock was idle starts from the current time", () => {
    const first = render(<Countdown target={NOW_SECONDS + DAY} />);
    first.unmount();
    vi.setSystemTime((NOW_SECONDS + 12 * HOUR) * 1000);
    render(<Countdown target={NOW_SECONDS + DAY} />);
    expect(screen.getByText("00d 12h 00m")).toBeInTheDocument();
  });

  it("a countdown inside a chain clock counts down from chain time, not the skewed browser clock", () => {
    vi.setSystemTime((NOW_SECONDS + HOUR) * 1000);
    render(
      <ChainClockProvider offsetMs={-HOUR * 1000}>
        <Countdown target={NOW_SECONDS + 2 * DAY} />
      </ChainClockProvider>,
    );
    const countdown = screen.getByText("02d 00h 00m");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(countdown).toHaveTextContent("01d 23h 59m");
  });

  it("outside a chain clock it uses the browser clock", () => {
    vi.setSystemTime((NOW_SECONDS + HOUR) * 1000);
    render(<Countdown target={NOW_SECONDS + 2 * DAY} />);
    expect(screen.getByText("01d 23h 00m")).toBeInTheDocument();
  });

  it("renders a placeholder instead of NaN for a non-finite target", () => {
    const { container } = render(<Countdown target={Number.NaN} />);
    expect(container).not.toHaveTextContent("NaN");
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
