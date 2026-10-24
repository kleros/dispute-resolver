const SECONDS_PER_MINUTE = 60n;
const SECONDS_PER_HOUR = 3_600n;
const SECONDS_PER_DAY = 86_400n;

interface DurationParts {
  readonly days: bigint;
  readonly hours: bigint;
  readonly minutes: bigint;
}

/** Whole days, hours and minutes of a duration; a negative, NaN or infinite duration counts as zero. */
function durationParts(seconds: number | bigint): DurationParts {
  let total: bigint;
  if (typeof seconds === "bigint") {
    total = seconds;
  } else {
    total = Number.isFinite(seconds) ? BigInt(Math.floor(seconds)) : 0n;
  }
  if (total < 0n) {
    total = 0n;
  }
  return {
    days: total / SECONDS_PER_DAY,
    hours: (total % SECONDS_PER_DAY) / SECONDS_PER_HOUR,
    minutes: (total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  };
}

function pad(value: bigint): string {
  return value.toString().padStart(2, "0");
}

/** Rounds down to the minute. */
export function formatDuration(seconds: number | bigint): string {
  const { days, hours, minutes } = durationParts(seconds);
  return `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m`;
}

/** The same duration as an ISO 8601 duration, for a `<time dateTime>` attribute. */
export function isoDuration(seconds: number | bigint): string {
  const { days, hours, minutes } = durationParts(seconds);
  return `P${days.toString()}DT${hours.toString()}H${minutes.toString()}M`;
}
