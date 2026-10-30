import type { Page } from "@playwright/test";

export const header = (page: Page) => page.getByRole("banner");
export const pill = (page: Page) => header(page).getByRole("button", { name: /^Network: / });
export const networkMenu = (page: Page) => header(page).getByRole("menu", { name: "Network" });
export const themeToggle = (page: Page) => header(page).getByRole("button", { name: /^Switch to (dark|light) theme$/ });
export const connectButton = (page: Page) => header(page).getByRole("button", { name: "Connect", exact: true });
export const accountButton = (page: Page) => header(page).getByRole("button", { name: /^Account 0x/ });
export const accountPanel = (page: Page) => header(page).getByRole("dialog", { name: "Account" });
export const menuButton = (page: Page) => header(page).getByRole("button", { name: "Menu", exact: true });
export const navLink = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });

export function disputeCard(page: Page, id: bigint) {
  return page.getByRole("link").filter({ has: page.getByText(`#${id.toString()}`, { exact: true }) });
}
