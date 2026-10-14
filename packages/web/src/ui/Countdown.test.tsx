import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  ])("spec 5.7: formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("spec 5.7: formats a bigint duration from the court's timesPerPeriod", () => {
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

  it("spec 3: shows the time left as DDd HHh MMm", () => {
    render(<Countdown target={NOW_SECONDS + 2 * DAY + 5 * HOUR + 7 * MINUTE + 30} testId="ongoing-card-countdown" />);
    const countdown = screen.getByTestId("ongoing-card-countdown");
    expect(countdown).toHaveTextContent("02d 05h 07m");
    expect(countdown.tagName).toBe("TIME");
    expect(countdown).toHaveAttribute("datetime", "P2DT5H7M");
  });

  it("spec 5.12: ticks on the shared 30 s clock", () => {
    render(<Countdown target={NOW_SECONDS + 3 * MINUTE + 30} testId="ongoing-card-countdown" />);
    const countdown = screen.getByTestId("ongoing-card-countdown");
    expect(countdown).toHaveTextContent("00d 00h 03m");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(countdown).toHaveTextContent("00d 00h 03m");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(countdown).toHaveTextContent("00d 00h 02m");
  });

  it("spec 5.7: shows zeros once the target has passed", () => {
    render(<Countdown target={NOW_SECONDS - HOUR} testId="ongoing-card-countdown" />);
    expect(screen.getByTestId("ongoing-card-countdown")).toHaveTextContent("00d 00h 00m");
  });

  it("11.3: every countdown shares one clock, stopped when the last one unmounts", () => {
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

  it("11.3: a countdown mounted after the clock was idle starts from the current time", () => {
    const first = render(<Countdown target={NOW_SECONDS + DAY} />);
    first.unmount();
    vi.setSystemTime((NOW_SECONDS + 12 * HOUR) * 1000);
    render(<Countdown target={NOW_SECONDS + DAY} testId="ongoing-card-countdown" />);
    expect(screen.getByTestId("ongoing-card-countdown")).toHaveTextContent("00d 12h 00m");
  });

  it("B12: a non-finite target renders a placeholder instead of NaN", () => {
    render(<Countdown target={Number.NaN} testId="ongoing-card-countdown" />);
    const countdown = screen.getByTestId("ongoing-card-countdown");
    expect(countdown).not.toHaveTextContent("NaN");
    expect(countdown).toHaveTextContent("Unknown");
  });
});
