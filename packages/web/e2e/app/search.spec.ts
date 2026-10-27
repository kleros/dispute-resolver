import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { isDisputesCall, MAINNET_ARBITRATOR, OUT_OF_RANGE_ON_MAINNET } from "../support/arbitrator";
import { appOriginOf, fakeNetwork, loadRecording, type Traffic } from "../support/network";

// Mainnet's arbitrator reverts past its last dispute. The build needs the chain-1 read RPC and the meta-evidence API
// configured, as a deploy has.

const RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));
const CASE_TITLE = "Proof of Humanity Governance Dispute";

function notFound(id: string): string {
  return `Dispute with ID ${id} does not exist on this network.`;
}

/** Dispute 1621 as recorded, and mainnet's node reverting `disputes(id)` for the dispute `id`, past its last one. */
function fakeMainnet(context: BrowserContext, baseURL: string | undefined, id: string): Promise<Traffic> {
  return fakeNetwork(context, {
    appOrigin: appOriginOf(baseURL),
    recordings: [RECORDING],
    rpc: (call) => (isDisputesCall(call, MAINNET_ARBITRATOR, BigInt(id)) ? OUT_OF_RANGE_ON_MAINNET : undefined),
  });
}

test("Back after a typed search returns to the dispute the search left", async ({ context, page, baseURL }) => {
  const missing = "99999999";
  await fakeMainnet(context, baseURL, missing);
  await page.goto("/1/cases/1621");
  const title = page.getByRole("heading", { name: CASE_TITLE, exact: true });
  await expect(title).toBeVisible({ timeout: 15_000 });

  const field = page.getByRole("searchbox", { name: "Dispute ID" });
  await field.clear();
  // Key by key, so a search that gave every key its own entry would send Back to /1/cases/9999999.
  await field.pressSequentially(missing);
  await expect(page).toHaveURL(`/1/cases/${missing}`);
  await expect(page.getByText(notFound(missing))).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL("/1/cases/1621");
  await expect(title).toBeVisible();
  await expect(field).toHaveValue("1621");
});

test("a digit typed and deleted before the debounce leaves history as it was, so one Back leaves the dispute", async ({ context, page, baseURL }) => {
  const typed = "16217";
  const traffic = await fakeMainnet(context, baseURL, typed);
  await page.goto("/1/cases");
  await page.goto("/1/cases/1621");
  const title = page.getByRole("heading", { name: CASE_TITLE, exact: true });
  await expect(title).toBeVisible({ timeout: 15_000 });

  const field = page.getByRole("searchbox", { name: "Dispute ID" });
  await field.press("End");
  await field.press("7");
  await expect(page).toHaveURL(`/1/cases/${typed}`);
  await field.press("Backspace");
  await expect(page).toHaveURL("/1/cases/1621");
  await expect(title).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL("/1/cases");
  expect(traffic.rpc.some((call) => isDisputesCall(call, MAINNET_ARBITRATOR, BigInt(typed)))).toBe(false);
});

test("an edit back to the dispute a settled lookup left keeps that lookup's entry, so Back returns to it", async ({ context, page, baseURL }) => {
  const typed = "16210";
  await fakeMainnet(context, baseURL, typed);
  await page.goto("/1/cases/1621");
  const title = page.getByRole("heading", { name: CASE_TITLE, exact: true });
  await expect(title).toBeVisible({ timeout: 15_000 });

  const field = page.getByRole("searchbox", { name: "Dispute ID" });
  await field.press("End");
  await field.press("0");
  await expect(page.getByText(notFound(typed))).toBeVisible();
  await field.press("Backspace");
  await expect(page).toHaveURL("/1/cases/1621");
  await expect(title).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(`/1/cases/${typed}`);
  await expect(page.getByText(notFound(typed))).toBeVisible();
});

/** Where the heading and each loading placeholder sit on the page, rounded to the pixel. */
function placeholderBoxes(page: Page): Promise<readonly (readonly [string, number, number, number, number])[]> {
  return page.locator("main h1, main [role='status']").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return [element.tagName, Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] as const;
    }),
  );
}

for (const width of [375, 1280]) {
  test(`keeps the heading and every placeholder in place when the search's pause ends and the lookup starts, at ${String(width)} px`, async ({ context, page, baseURL }) => {
    const held = 4242n;
    const isHeldLookup = (call: Parameters<typeof isDisputesCall>[0]) => isDisputesCall(call, MAINNET_ARBITRATOR, held);
    const traffic = await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), holdRpc: isHeldLookup });
    await page.setViewportSize({ width, height: 900 });
    // The placeholders' entrance moves them for a moment; held still, only the layout is compared.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/1/cases");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    await page.getByRole("searchbox", { name: "Dispute ID" }).fill(held.toString());
    await expect(page.getByRole("heading", { name: `Dispute #${held.toString()}`, exact: true })).toBeVisible();
    const pending = await placeholderBoxes(page);
    expect(traffic.rpc.some(isHeldLookup), "the lookup started before the pending page was measured").toBe(false);

    await expect.poll(() => traffic.rpc.some(isHeldLookup), { message: "disputes(id) never read (needs the chain-1 read RPC in the build)" }).toBe(true);
    expect(pending.length).toBeGreaterThan(0);
    expect(await placeholderBoxes(page)).toEqual(pending);
  });
}
