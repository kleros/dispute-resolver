import { expect, type Locator, type Page } from "@playwright/test";

// How the runner specs open a panel of the case page's accordion (spec 5.11) without losing the click (P16-R3).
//
// Each section of the case page renders as soon as its own data allows (P-20), so the page keeps moving after the
// meta-evidence settles: on dispute 1621 the timeline and the decision replace their placeholders about half a second
// after the script's title, and the accordion moves down 84 px. Playwright checks the hit target on the pointer's first
// event only, and the library's button presses only when the pointer is released over it, so a shift between the press
// and the release lands the release, and the click, on another element: the panel stays closed. A click is therefore
// sent only once no section is loading.

/** Waits until no section of the case page is loading: every placeholder (`role="status"`) is gone from `main`. */
export async function expectCaseSectionsSettled(page: Page): Promise<void> {
  await expect(page.getByRole("main").getByRole("status"), "case sections still loading").toHaveCount(0);
}

/** The header of the accordion panel `name` (Appeal, Question or Evidence). */
export function caseSectionHeader(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** Opens the accordion panel `name` once the page has settled, and returns its region. */
export async function openCaseSection(page: Page, name: string): Promise<Locator> {
  await expectCaseSectionsSettled(page);
  const header = caseSectionHeader(page, name);
  await header.click();
  await expect(header, `the ${name} header did not open on its click`).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("region", { name, exact: true });
}
