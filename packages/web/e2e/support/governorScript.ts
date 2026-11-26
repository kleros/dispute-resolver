import type { Page } from "@playwright/test";
import { CORS_HEADERS } from "./network";

/** The script dispute 1621's meta-evidence names, on the mainnet allowlist; the allowlist compares paths, not bytes. */
const GOVERNOR_SCRIPT_PATH = "/ipfs/QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4";

const SCRIPT_TEXT = 'var getMetaEvidence = function () { resolveScript({ rulingOptions: { type: "single-select", titles: ["List 1", "List 2"] } }); };';

/**
 * Serves a test script that titles the governor's two lists. The recording holds no script, and the case page holds a
 * governor's Fund while the gateway does not serve the script that titles its lists.
 */
export async function serveGovernorScript(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === GOVERNOR_SCRIPT_PATH,
    (route) =>
      route.request().method() === "GET" ? route.fulfill({ headers: CORS_HEADERS, contentType: "application/javascript; charset=utf-8", body: SCRIPT_TEXT }) : route.fallback(),
  );
}
