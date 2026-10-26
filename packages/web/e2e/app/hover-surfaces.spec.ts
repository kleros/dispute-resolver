import { expect, test, type Locator, type Page } from "@playwright/test";
import { openDisputesRpc } from "../support/arbitrator";
import { appOriginOf, fakeNetwork } from "../support/network";

// What the pointer does to the locked upload zone and to an Ongoing card, read from the built stylesheet's cascade. The
// Ongoing case needs the build's chain-1 read RPC, as a deploy has.

/** The computed colour a token resolves to in the current theme. */
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}

async function style(locator: Locator, property: "backgroundColor" | "borderTopColor" | "transitionProperty" | "transitionDuration"): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element)[name], property);
}

/** The cursor the browser shows at the centre of `locator`: the one of the element the pointer actually lands on. */
async function cursorOver(page: Page, locator: Locator): Promise<string> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) throw new Error("The element has no box on the page.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  return page.evaluate(
    ([px, py]) => {
      const target = document.elementFromPoint(px, py);
      return target === null ? "" : getComputedStyle(target).cursor;
    },
    [x, y] as const,
  );
}

test("without a wallet the locked upload zone keeps its grey fill under the pointer, shows the not-allowed cursor over the whole zone and the normal one over its message", async ({
  context,
  page,
  baseURL,
}) => {
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });
  await page.goto("/1/create");
  const field = page.getByRole("group", { name: /^Primary Document/ });
  const zone = field.locator("[data-disabled]");
  await expect(zone).toBeVisible();
  const lockedFill = await tokenColor(page, "--klerosUIComponentsLightGrey");
  expect(await style(zone, "backgroundColor")).toBe(lockedFill);

  expect(await cursorOver(page, zone)).toBe("not-allowed");
  expect(await cursorOver(page, field.getByRole("button", { name: /^Primary Document/ }))).toBe("not-allowed");
  expect(await style(zone, "backgroundColor")).toBe(lockedFill);
  expect(await cursorOver(page, field.locator("#dropzone-label"))).toBe("auto");
});

test.describe("an Ongoing card under the pointer", () => {
  const ID = 901n;
  const card = (page: Page) => page.getByRole("link").filter({ has: page.getByText(`#${ID.toString()}`, { exact: true }) });
  const surface = (page: Page) => card(page).locator(":scope > *").first();

  test.beforeEach(async ({ context, baseURL }) => {
    await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc([ID], 24_000_000n) });
  });

  test("fills with the library's light blue over 200 ms while its edge stays as at rest", async ({ page }) => {
    await page.goto("/1/ongoing");
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    const edge = await style(surface(page), "borderTopColor");
    expect(await style(surface(page), "transitionProperty")).toBe("background-color");
    expect(await style(surface(page), "transitionDuration")).toBe("0.2s");

    await card(page).hover();
    const hoverFill = await tokenColor(page, "--klerosUIComponentsMediumBlue");
    await expect.poll(() => style(surface(page), "backgroundColor")).toBe(hoverFill);
    expect(await style(surface(page), "borderTopColor")).toBe(edge);
  });

  test("fills at once under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/1/ongoing");
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    expect(await style(surface(page), "transitionProperty")).toBe("none");

    await card(page).hover();
    expect(await style(surface(page), "backgroundColor")).toBe(await tokenColor(page, "--klerosUIComponentsMediumBlue"));
  });
});
