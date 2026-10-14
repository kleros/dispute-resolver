/**
 * Real content identifiers used across the `uri` tests. A hand-typed CID that is one character off fails the shape check
 * and makes a rejection test pass for the wrong reason, so every value here is a CID that exists on-chain or in IPFS docs.
 */

/** The T2CR evidence display (spec 10.6, ledger D-26). */
export const T2CR_DISPLAY_CID = "QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh";

/** The Dispute Resolver's default dynamic script (spec 10.7). */
export const DEFAULT_SCRIPT_CID = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";

/** A base32 CIDv1 (the IPFS documentation's example directory). */
export const CIDV1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

/** Dynamic-script allowlist entries as today's `dynamicScriptWhitelist.js` lists them (06 §3 invariant 4). */
export const ALLOWLIST_ENTRIES = [
  DEFAULT_SCRIPT_CID,
  "QmchWC6L3dT23wwQiJJLWCeS1EDnDYrLcYat93C4Lm4P4E/linguo-dynamic-script.js",
  "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js",
  "QmSsM1ks9Q9xAd26uWxR3Sm1ZowpsEA49Vpvs6sWTBWjeg/realitio.js",
] as const;

/** The Gnosis allowlist entry that today carries a trailing slash (checklist B18). */
export const TRAILING_SLASH_ENTRY = "QmRnwMuc7kGipQkjzPY9jhcttRhebPRYwEvBVGTjmkMwe9/";

/** The `%20`-encoded document path of Gnosis dispute 416 (golden case 04), as the Kleros subgraph serves it. */
export const GNOSIS_416_PATH =
  "/ipfs/QmW4zDA8X95cyfAsW9Nq1t7XNTyP3sMQAWNRFoQhMpgAv7/Kleros%20Moderate%20x%20Reality.eth%20Oracle%20-%20Telegram%20Content%20Moderation%20Question%20Resolution%20Policy.pdf";

/** The default gateway of spec 6.4. */
export const DEFAULT_GATEWAY = "https://cdn.kleros.link";

/** Pages of the app an untrusted link is rendered on, as the base URL a browser resolves the link's `href` against (URI-01). */
export const APP_PAGE_BASES = ["https://resolve.kleros.io/", "https://resolve.kleros.io/1/cases/5?tab=evidence#top"] as const;

/**
 * `https:` references that spell no authority. Parsed without a base they name host `0.0.0.1` or `example.org`; as an
 * `href` on an https page a browser resolves them against the page, so they lead back to the app (URI-01).
 */
export const AUTHORITY_LESS_HTTPS = ["https:/1/cases/5", "https:1/cases/5", "https:\\1/cases/5", "HTTPS:/1/cases/5", " https:/example.org/report.pdf "] as const;

/** `https:` URLs that spell their authority, including spellings a URL parser repairs the same way with or without a base. */
export const EXPLICIT_AUTHORITY_HTTPS = [
  "https://curate.kleros.io/tcr/100/0xabc",
  "HTTPS://kleros.io",
  "https:///1/cases/5",
  "https://\\evil.example/report.pdf",
  `https://ipfs.kleros.io/ipfs/${T2CR_DISPLAY_CID}/index.html`,
  `https://example.org/ipfs/${T2CR_DISPLAY_CID}/../../ipns/evil.eth/index.html`,
] as const;

/** Every `https:` spelling above, for checks that must hold whichever way a builder treats each one. */
export const HTTPS_SPELLINGS = [...EXPLICIT_AUTHORITY_HTTPS, ...AUTHORITY_LESS_HTTPS] as const;

/**
 * Whether a browser rendering `link` as an `href` on some page in `APP_PAGE_BASES` lands anywhere other than the URL the
 * link parses to on its own: the gap between what a check validated and where the user goes (URI-01).
 */
export function movesOnAppPages(link: string): boolean {
  const checked = new URL(link).href;
  return APP_PAGE_BASES.some((base) => new URL(link, base).href !== checked);
}

/** The host names a browser lands on when `link` is the `href` of an anchor on each page in `APP_PAGE_BASES`. */
export function landingHostsOnAppPages(link: string): string[] {
  return APP_PAGE_BASES.map((base) => new URL(link, base).hostname);
}
