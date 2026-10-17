import { expect, test, type Locator, type Page } from "@playwright/test";
import { ATLAS_NONCE, fakeAtlas } from "../support/atlas";
import { fakeNetwork } from "../support/network";
import { changeWalletAccount, injectWallet, walletSignatures, type SignedMessage } from "../support/wallet";

// The Atlas session in a real browser tab (checklist A15, ledger D-20 and D-52), on the built app with a wallet configured
// (playwright.config.ts) and Atlas served by the spec. The Create page's primary document is the upload: the first file
// signs in and uploads in one action; a reload of the same tab keeps the session once the wallet reconnects, so the next
// file uploads without a signature; an account switch in the wallet leaves the session unverified, so the next file asks
// the new account to sign. The build needs `REACT_APP_ATLAS_URI` configured, as a deploy has; its host is never named,
// since every request leaving the app's origin is routed by shape.

const FIRST_ACCOUNT = "0x00000000000000000000000000000000000000e2";
const SECOND_ACCOUNT = "0x00000000000000000000000000000000000000e3";
const CREATE_PATH = "/1/create";
const FIELD_NAME = "Primary Document (Optional)";
const TEN_MINUTES_MS = 10 * 60 * 1000;

/** Fails early, and says why, when the build connects no wallet (K-02: no WalletConnect project ID). */
async function expectWalletConnected(page: Page, shortAddress: string): Promise<void> {
  await expect(
    page.getByRole("button", { name: `Account ${shortAddress}` }),
    "the injected wallet never connected (the build needs REACT_APP_WALLETCONNECT_PROJECT_ID)",
  ).toBeVisible({
    timeout: 30_000,
  });
}

/** The primary-document upload field. */
function documentField(page: Page): Locator {
  return page.getByRole("group", { name: FIELD_NAME, exact: true });
}

/** Waits until the field knows Atlas's limits (the `roles` query at load), failing with a hint when Atlas is not configured. */
async function expectFieldReady(field: Locator): Promise<void> {
  await expect(field.getByText("Uploads are unavailable on this deployment."), "uploads are unavailable (the build needs REACT_APP_ATLAS_URI)").toHaveCount(0);
  await expect(field.getByText(/Maximum size: 20 MB\.$/)).toBeVisible({ timeout: 30_000 });
}

/** Chooses `name` in the field's file picker, as the user does, and waits for the upload to be reported. */
async function uploadDocument(page: Page, name: string): Promise<void> {
  const field = documentField(page);
  const chooser = page.waitForEvent("filechooser");
  await field.getByRole("button", { name: FIELD_NAME, exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
  await expect(field.getByText(`Uploaded ${name}.`, { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** The value of one `Name: value` line of a SIWE message (EIP-4361). */
function siweField(message: string, name: string): string | undefined {
  const prefix = `${name}: `;
  return message
    .split("\n")
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length);
}

/** A15: an EIP-4361 message for the app's host and the page's chain, with Atlas's nonce and a 10-minute expiry. */
function expectSiweMessage(message: string, host: string): void {
  const [preamble] = message.split("\n");
  expect(preamble, "the domain is the app's host").toBe(`${host} wants you to sign in with your Ethereum account:`);
  expect(siweField(message, "Chain ID"), "the page's chain").toBe("1");
  expect(siweField(message, "Nonce"), "the nonce Atlas issued").toBe(ATLAS_NONCE);
  const issuedAt = Date.parse(siweField(message, "Issued At") ?? "");
  const expiresAt = Date.parse(siweField(message, "Expiration Time") ?? "");
  expect(Math.abs(expiresAt - issuedAt - TEN_MINUTES_MS), "a 10-minute expiry").toBeLessThan(5_000);
}

function accountsOf(signed: readonly SignedMessage[]): string[] {
  return signed.map(({ account }) => account);
}

test("A15, D-20, D-52: the first upload signs in, a reload of the tab keeps the session, an account switch asks the new account to sign", async ({ context, page, baseURL }) => {
  const appUrl = new URL(baseURL ?? "http://localhost");
  const atlas = fakeAtlas();
  await injectWallet(context, { account: FIRST_ACCOUNT, chainId: 1, signs: true });
  await fakeNetwork(context, { appOrigin: appUrl.origin, atlas: atlas.answer });

  await page.goto(CREATE_PATH);
  await expectWalletConnected(page, "0x0000…00E2");
  await expectFieldReady(documentField(page));
  // A15: nothing is signed at load.
  expect(await walletSignatures(page)).toEqual([]);
  expect(atlas.logins).toEqual([]);

  // D-52: choosing the file signs in, then uploads, in one action.
  await uploadDocument(page, "brief.pdf");
  const firstSignIns = await walletSignatures(page);
  expect(accountsOf(firstSignIns)).toEqual([FIRST_ACCOUNT]);
  expectSiweMessage(firstSignIns[0]?.message ?? "", appUrl.host);
  expect(atlas.logins.map(({ account }) => account.toLowerCase())).toEqual([FIRST_ACCOUNT]);
  const [firstSession] = atlas.logins;
  expect(atlas.uploads).toEqual([firstSession?.token]);

  // D-20, A15: a reload of the same tab keeps the session once the wallet reconnects; the next file needs no signature.
  await page.reload();
  await expectWalletConnected(page, "0x0000…00E2");
  await expectFieldReady(documentField(page));
  await uploadDocument(page, "second.pdf");
  expect(await walletSignatures(page), "the reloaded tab asked for a new signature").toEqual([]);
  expect(atlas.logins).toHaveLength(1);
  expect(atlas.uploads).toEqual([firstSession?.token, firstSession?.token]);

  // A15, D-20: an account switch leaves the session unverified; the next file asks the new account to sign in.
  await changeWalletAccount(page, SECOND_ACCOUNT);
  await expectWalletConnected(page, "0x0000…00E3");
  await uploadDocument(page, "third.pdf");
  expect(accountsOf(await walletSignatures(page))).toEqual([SECOND_ACCOUNT]);
  expect(atlas.logins.map(({ account }) => account.toLowerCase())).toEqual([FIRST_ACCOUNT, SECOND_ACCOUNT]);
  const secondSession = atlas.logins[1];
  expect(secondSession?.token).not.toBe(firstSession?.token);
  expect(atlas.uploads).toEqual([firstSession?.token, firstSession?.token, secondSession?.token]);
});
