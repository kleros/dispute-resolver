import { expect, test } from "@playwright/test";
import { fakeNetwork } from "../support/network";

// The footer's explorer link on the built app (ledger D-40, maintainer question MC-1): each chain links its
// ArbitrableProxy on the explorer of the core table. The specs answer no RPC and no recording, so nothing leaves the
// machine: the footer is drawn from the table alone, whatever the reads give.

test("MC-1, D-40: the Gnosis footer links its ArbitrableProxy on gnosisscan.io", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin });
  await page.goto("/100/cases");
  await expect(page.getByRole("link", { name: "ArbitrableProxy contract on the Gnosis Network explorer" })).toHaveAttribute(
    "href",
    "https://gnosisscan.io/address/0xc7add3c961f7935cb4914e37da991d2f1cd7986c#code",
  );
});

test("MC-1, D-40: the Chiado footer links its ArbitrableProxy on gnosis-chiado.blockscout.com", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin });
  await page.goto("/10200/cases");
  await expect(page.getByRole("link", { name: "ArbitrableProxy contract on the Gnosis Testnet Chiado explorer" })).toHaveAttribute(
    "href",
    "https://gnosis-chiado.blockscout.com/address/0x4bef0321bd7fa943f85ae55e07f790c6becbd177#code",
  );
});
