import { useColorScheme } from "./colorScheme";

const BUTTON_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-current/10 transition-colors duration-150 motion-reduce:transition-none";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

/** Flips the page between the light and dark themes; the icon and the name show what a click will switch to. */
export function ThemeToggle() {
  const { scheme, toggle } = useColorScheme();
  const isDark = scheme === "dark";
  return (
    <button type="button" className={BUTTON_CLASS} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
