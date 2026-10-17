import { expect, test, type Page } from "@playwright/test";
import { fakeNetwork } from "../support/network";
import { injectWallet } from "../support/wallet";

// The unsupported-network and 404 screens on the built app (ledger D-45, spec §2.5, §2.6): the header's links are built
// from the resolved chain (the URL's chain when configured, else a connected wallet's configured chain, else chain 1),
// never from the raw URL segment, so none of them points at `undefined` or at the unconfigured chain.

/** The header's internal links: the logo and the navigation (the Create link shows only where creating is possible). */
async function headerHrefs(page: Page): Promise<string[]> {
  const hrefs = await page
    .getByRole("banner")
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.filter((href) => href.startsWith("/"));
}

/** Whether every header link stays on `chainId`, with the Ongoing and Interact links among them. */
async function headerOn(page: Page, chainId: number): Promise<boolean> {
  const hrefs = await headerHrefs(page);
  const prefix = `/${chainId.toString()}`;
  return (
    hrefs.every((href) => href === prefix || href.startsWith(`${prefix}/`)) &&
    hrefs.includes(`${prefix}/ongoing`) &&
    hrefs.includes(`${prefix}/cases`) &&
    !hrefs.some((href) => href.includes("undefined"))
  );
}

test("D-45: an unconfigured chain shows the unsupported-network screen with header links on the default chain", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin });

  await page.goto("/424242/ongoing");

  await expect(page.getByRole("heading", { name: "Unsupported Network 424242" })).toBeVisible();
  expect(await headerOn(page, 1), (await headerHrefs(page)).join(" ")).toBe(true);
});

test("D-45: on the unsupported-network screen the header links follow a wallet on a configured chain", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: "0x00000000000000000000000000000000000000e2", chainId: 100 });
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin });

  await page.goto("/424242/ongoing");

  await expect(page.getByRole("heading", { name: "Unsupported Network 424242" })).toBeVisible();
  await expect.poll(() => headerOn(page, 100), { message: "the injected wallet never connected (the build needs REACT_APP_WALLETCONNECT_PROJECT_ID)" }).toBe(true);
});

test("D-45: an unknown path under a configured chain is the 404 screen, with header links on the URL's chain", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin });

  await page.goto("/100/nowhere");

  await expect(page.getByText("404", { exact: true })).toBeVisible();
  await expect(page.getByText("Something went wrong in Athens!")).toBeVisible();
  expect(await headerOn(page, 100), (await headerHrefs(page)).join(" ")).toBe(true);
});
