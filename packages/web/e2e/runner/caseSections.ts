import { expect, type Locator, type Page } from "@playwright/test";

// The sections keep moving the accordion as they load. Playwright checks the hit target on the pointer's first event
// only and the library's button presses on release, so a shift in between loses the click: click once none is loading.

export async function expectCaseSectionsSettled(page: Page): Promise<void> {
  await expect(page.getByRole("main").getByRole("status"), "case sections still loading").toHaveCount(0);
}

export function caseSectionHeader(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

export async function openCaseSection(page: Page, name: string): Promise<Locator> {
  await expectCaseSectionsSettled(page);
  const header = caseSectionHeader(page, name);
  await header.click();
  await expect(header, `the ${name} header did not open on its click`).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("region", { name, exact: true });
}
