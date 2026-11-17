import { expect, test, type Locator, type Page } from "@playwright/test";
import { ATLAS_NONCE, fakeAtlas } from "../support/atlas";
import { fakeNetwork } from "../support/network";
import { changeWalletAccount, expectWalletConnected, injectWallet, walletSignatures, type SignedMessage } from "../support/wallet";

// A reload restores the uploaded document from the form's stored draft, so the spec removes it to see the empty field.

const FIRST_ACCOUNT = "0x00000000000000000000000000000000000000e2";
const SECOND_ACCOUNT = "0x00000000000000000000000000000000000000e3";
const CREATE_PATH = "/1/create";
const FIELD_NAME = "Primary Document (Optional)";
const TEN_MINUTES_MS = 10 * 60 * 1000;
const SIGN_IN_SENTENCE = "Your wallet will ask you to sign in before the first upload.";

function accountButton(page: Page, shortAddress: string): Locator {
  return page.getByRole("button", { name: `Account ${shortAddress}` });
}

function documentField(page: Page): Locator {
  return page.getByRole("group", { name: FIELD_NAME, exact: true });
}

/**
 * Waits until the field knows Atlas's limits (the `roles` query at load), failing with a hint when Atlas is not
 * configured, and checks whether the field announces the sign-in the first upload asks for.
 */
async function expectFieldReady(field: Locator, { announcesSignIn }: { announcesSignIn: boolean }): Promise<void> {
  await expect(field.getByRole("button", { name: FIELD_NAME, exact: true }), "uploads are unavailable (the build needs REACT_APP_ATLAS_URI)").toBeEnabled();
  await expect(field.getByText(/PDF or image, up to 20 MB\./)).toBeVisible({ timeout: 30_000 });
  const signInSentence = field.getByText(SIGN_IN_SENTENCE);
  if (announcesSignIn) await expect(signInSentence).toBeVisible();
  else await expect(signInSentence).toHaveCount(0);
}

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

test("the field announces the sign-in until the first upload signs in, a reload of the tab keeps the session, an account switch asks the new account to sign", async ({
  context,
  page,
  baseURL,
}) => {
  const appUrl = new URL(baseURL ?? "http://localhost");
  const atlas = fakeAtlas();
  await injectWallet(context, { account: FIRST_ACCOUNT, chainId: 1, signs: true });
  await fakeNetwork(context, { appOrigin: appUrl.origin, atlas: atlas.answer });

  await page.goto(CREATE_PATH);
  await expectWalletConnected(accountButton(page, "0x0000…00E2"));
  await expectFieldReady(documentField(page), { announcesSignIn: true });
  expect(await walletSignatures(page)).toEqual([]);
  expect(atlas.logins).toEqual([]);

  await uploadDocument(page, "brief.pdf");
  await expect(documentField(page).getByText(SIGN_IN_SENTENCE)).toHaveCount(0);
  const firstSignIns = await walletSignatures(page);
  expect(accountsOf(firstSignIns)).toEqual([FIRST_ACCOUNT]);
  expectSiweMessage(firstSignIns[0]?.message ?? "", appUrl.host);
  expect(atlas.logins.map(({ account }) => account.toLowerCase())).toEqual([FIRST_ACCOUNT]);
  const [firstSession] = atlas.logins;
  expect(atlas.uploads).toEqual([firstSession?.token]);

  await page.reload();
  await expectWalletConnected(accountButton(page, "0x0000…00E2"));
  const reloadedField = documentField(page);
  await expect(reloadedField.getByText("Uploaded brief.pdf.", { exact: true }), "the reload restored the stored draft's document").toBeVisible();
  await reloadedField.getByRole("button", { name: "Remove file", exact: true }).click();
  await expectFieldReady(reloadedField, { announcesSignIn: false });
  await uploadDocument(page, "second.pdf");
  expect(await walletSignatures(page), "the reloaded tab asked for a new signature").toEqual([]);
  expect(atlas.logins).toHaveLength(1);
  expect(atlas.uploads).toEqual([firstSession?.token, firstSession?.token]);

  await changeWalletAccount(page, SECOND_ACCOUNT);
  await expectWalletConnected(accountButton(page, "0x0000…00E3"));
  await uploadDocument(page, "third.pdf");
  expect(accountsOf(await walletSignatures(page))).toEqual([SECOND_ACCOUNT]);
  expect(atlas.logins.map(({ account }) => account.toLowerCase())).toEqual([FIRST_ACCOUNT, SECOND_ACCOUNT]);
  const secondSession = atlas.logins[1];
  expect(secondSession?.token).not.toBe(firstSession?.token);
  expect(atlas.uploads).toEqual([firstSession?.token, firstSession?.token, secondSession?.token]);
});
