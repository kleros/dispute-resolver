/** A Unix time in seconds as UTC text; "Unknown time" when it is not a date. */
export function utcText(seconds: number): string {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toUTCString();
}

/** A Unix time in seconds as a `<time>` in UTC, the one format the case page states dates in. */
export function Timestamp({ value, className }: { readonly value: number; readonly className?: string }) {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return <span className={className}>Unknown time</span>;
  return (
    <time dateTime={date.toISOString()} className={className}>
      {date.toUTCString()}
    </time>
  );
}
