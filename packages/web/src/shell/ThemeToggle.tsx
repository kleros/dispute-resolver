import { useColorScheme } from "./colorScheme";

const BUTTON_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-current/10 motion-reduce:transition-none";

// Tailwind's scale utilities set the `scale` property, not `transform`. No will-change: it would keep the icon rasterised
// at its quarter-size start and scale it up blurred.
const ICON_CLASS = "[grid-area:1/1] transition-[opacity,filter,scale] duration-250 ease-[ease-in-out] motion-reduce:transition-none";
const ICON_SHOWN = "opacity-100 [filter:blur(0)] scale-100";
const ICON_HIDDEN = "opacity-0 [filter:blur(2px)] scale-25";

interface IconProps {
  readonly className: string;
}

function SunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

/**
 * Flips the page between the light and dark themes; the icon and the name show what a click will switch to. Both icons
 * stay mounted in one grid cell and cross-fade; `data-icon-swap` exempts them from the pause index.css puts on every other
 * transition during the flip.
 */
export function ThemeToggle() {
  const { scheme, toggle } = useColorScheme();
  const isDark = scheme === "dark";
  return (
    <button type="button" className={BUTTON_CLASS} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
      <span data-icon-swap="" data-state={scheme} className="inline-grid">
        <SunIcon className={`${ICON_CLASS} ${isDark ? ICON_SHOWN : ICON_HIDDEN}`} />
        <MoonIcon className={`${ICON_CLASS} ${isDark ? ICON_HIDDEN : ICON_SHOWN}`} />
      </span>
    </button>
  );
}
