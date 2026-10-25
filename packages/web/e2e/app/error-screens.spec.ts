import { expect, test, type Page } from "@playwright/test";
import { appOriginOf, fakeNetwork } from "../support/network";
import { injectWallet } from "../support/wallet";

// The header's links are built from the resolved chain (the URL's chain when configured, else a connected wallet's
// configured chain, else chain 1), never from the raw URL segment, so none of them points at `undefined` or at the
// unconfigured chain.

/** The Create link shows only where creating is possible. */
async function headerHrefs(page: Page): Promise<string[]> {
  const hrefs = await page
    .getByRole("banner")
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.filter((href) => href.startsWith("/"));
}

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

test("shows the unsupported-network screen for an unconfigured chain with header links on the default chain", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });

  await page.goto("/424242/ongoing");

  await expect(page.getByRole("heading", { name: "Unsupported Network 424242" })).toBeVisible();
  expect(await headerOn(page, 1), (await headerHrefs(page)).join(" ")).toBe(true);
});

test("points the unsupported-network header links at a connected wallet's configured chain", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: "0x00000000000000000000000000000000000000e2", chainId: 100 });
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });

  await page.goto("/424242/ongoing");

  await expect(page.getByRole("heading", { name: "Unsupported Network 424242" })).toBeVisible();
  await expect.poll(() => headerOn(page, 100), { message: "the injected wallet never connected (the build needs REACT_APP_WALLETCONNECT_PROJECT_ID)" }).toBe(true);
});

test("shows the 404 screen for an unknown path under a configured chain with header links on the URL's chain", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });

  await page.goto("/100/nowhere");

  await expect(page.getByText("404", { exact: true })).toBeVisible();
  await expect(page.getByText("Something went wrong in Athens!")).toBeVisible();
  expect(await headerOn(page, 100), (await headerHrefs(page)).join(" ")).toBe(true);
});
