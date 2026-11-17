import { expect, test, type Page } from "@playwright/test";
import { appOriginOf, fakeNetwork } from "../support/network";

// The component library's react-aria reads this global once when it loads; read before src/calendar.ts defines it, the
// date fields keep the browser language's own calendar. Only the built bundle's chunk order decides which runs first.

interface LocaleRead {
  readonly value: string | null;
  /** The calendar the browser formats in for what the library ends up with (`navigator.language` when the value is unset). */
  readonly calendar: string;
}

interface LocaleReads {
  readonly beforePin: number;
  readonly pinned: LocaleRead[];
}

/**
 * Counts the reads of react-aria's locale global before src/calendar.ts defines it, and records each answer after. With a
 * `language`, `navigator.language` answers it while the browser keeps its own locale.
 */
function recordLocaleReads(language: string | null): void {
  if (language !== null) Object.defineProperty(Navigator.prototype, "language", { configurable: true, get: () => language });
  const key = Symbol.for("react-aria.i18n.locale");
  const reads = { beforePin: 0, pinned: [] as LocaleRead[] };
  Reflect.set(window, "__localeReads", reads);
  Object.defineProperty(window, key, {
    configurable: true,
    get() {
      reads.beforePin += 1;
      return undefined;
    },
  });
  const define = Object.defineProperty.bind(Object);
  Object.defineProperty = <T>(target: T, property: PropertyKey, attributes: PropertyDescriptor): T => {
    if (target !== window || property !== key || attributes.get === undefined) return define(target, property, attributes);
    return define(target, property, {
      ...attributes,
      get() {
        const value: unknown = attributes.get?.call(window);
        const locale = typeof value === "string" ? value : navigator.language;
        reads.pinned.push({ value: typeof value === "string" ? value : null, calendar: new Intl.DateTimeFormat(locale).resolvedOptions().calendar });
        return value;
      },
    });
  };
}

async function localeReads(page: Page): Promise<LocaleReads> {
  return page.evaluate(() => Reflect.get(window, "__localeReads") as LocaleReads);
}

const BROWSERS = [
  { name: "a fa-IR browser", locale: "fa-IR", language: null, expected: "fa-IR-u-ca-gregory" },
  { name: "a th-TH browser", locale: "th-TH", language: null, expected: "th-TH-u-ca-gregory" },
  // Chromium has no data for Pashto: it formats in the browser's own locale and ignores a calendar asked of `ps-AF`.
  { name: "a fa-IR browser whose language is ps-AF", locale: "fa-IR", language: "ps-AF", expected: "fa-IR-u-ca-gregory" },
];

for (const { name, locale, language, expected } of BROWSERS) {
  test.describe(`in ${name}`, () => {
    test.use({ locale });

    test("the component library formats dates with the Gregorian calendar from its first read", async ({ context, page, baseURL }) => {
      await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });
      await context.addInitScript(recordLocaleReads, language);
      await page.goto("/1/ongoing");
      await expect.poll(async () => (await localeReads(page)).pinned.length).toBeGreaterThan(0);
      const reads = await localeReads(page);
      expect(reads.beforePin).toBe(0);
      expect(new Set(reads.pinned.map((read) => read.calendar))).toEqual(new Set(["gregory"]));
      expect(new Set(reads.pinned.map((read) => read.value))).toEqual(new Set([expected]));
    });
  });
}
