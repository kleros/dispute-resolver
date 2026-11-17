/**
 * @kleros/ui-components-library bundles its own react-aria and exports no I18nProvider, so its date fields take their
 * calendar from the browser language: in a Persian-language browser a typed Gregorian date is read as a Persian one and
 * funds another day. react-aria reads this global before `navigator.language`, once when the library is loaded and again
 * on each `languagechange`, so this module has to run before the library is imported.
 */
const REACT_ARIA_LOCALE = Symbol.for("react-aria.i18n.locale");

/**
 * The locale the browser formats `language` in, with the Gregorian calendar, or `undefined` when that is already its
 * calendar or the tag is malformed, so react-aria falls through to `navigator.language` as without this module; never throws.
 */
export function gregorianLocale(language: string): string | undefined {
  try {
    // A browser with no data for the language formats in its own locale and drops the calendar the tag asks for, and any
    // other key added to the tag changes the library's exact-match lookup of its translations.
    const resolved = new Intl.DateTimeFormat(language).resolvedOptions();
    if (resolved.calendar === "gregory") return undefined;
    return new Intl.Locale(resolved.locale, { calendar: "gregory" }).toString();
  } catch {
    return undefined;
  }
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, REACT_ARIA_LOCALE, { configurable: true, get: () => gregorianLocale(navigator.language) });
}
