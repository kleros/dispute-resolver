import { expect, test } from "@playwright/test";
import { appOriginOf, fakeNetwork } from "../support/network";

// No RPC answers and no recordings: the footer is drawn from the chain table alone, whatever the reads give.

test("links the Gnosis ArbitrableProxy on gnosisscan.io in the footer", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });
  await page.goto("/100/cases");
  await expect(page.getByRole("link", { name: "ArbitrableProxy contract on the Gnosis Network explorer" })).toHaveAttribute(
    "href",
    "https://gnosisscan.io/address/0xc7add3c961f7935cb4914e37da991d2f1cd7986c#code",
  );
});

test("links the Chiado ArbitrableProxy on gnosis-chiado.blockscout.com in the footer", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });
  await page.goto("/10200/cases");
  await expect(page.getByRole("link", { name: "ArbitrableProxy contract on the Gnosis Testnet Chiado explorer" })).toHaveAttribute(
    "href",
    "https://gnosis-chiado.blockscout.com/address/0x4bef0321bd7fa943f85ae55e07f790c6becbd177#code",
  );
});
