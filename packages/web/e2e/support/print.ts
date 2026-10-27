import { expect, type Page } from "@playwright/test";

// Chromium's page.pdf is the one print a test can read back, and it lays the page out as Chromium prints it. Every link
// it paints becomes a link annotation, which places the link on its page, so two prints of a page can be compared without
// rendering them. Chromium writes the PDF uncompressed, with a plain cross-reference table: a parser that cannot find its
// objects throws, so a print never passes a check by being unreadable.

export interface PrintedLink {
  /** A path for the app's own pages, else the whole URL. */
  readonly href: string;
  /** Points from the page's top edge. */
  readonly top: number;
  readonly bottom: number;
  /** Points from the page's left edge. */
  readonly left: number;
}

export interface PrintedPage {
  readonly height: number;
  readonly links: readonly PrintedLink[];
}

/** Every indirect object of the PDF by number, its text running to its own `endobj`. */
function pdfObjects(pdf: string): Map<number, string> {
  const xrefAt = /^startxref\s+(\d+)/.exec(pdf.slice(pdf.lastIndexOf("startxref")));
  const table = xrefAt === null ? null : /^xref\s+(\d+)\s+(\d+)\s/.exec(pdf.slice(Number(xrefAt[1])));
  if (xrefAt === null || table === null) throw new Error("The PDF has no plain cross-reference table to find its objects by.");
  const first = Number(table[1]);
  const entries = [...pdf.slice(Number(xrefAt[1]) + table[0].length).matchAll(/(\d{10}) \d{5} ([nf])/g)].slice(0, Number(table[2]));
  const objects = new Map<number, string>();
  entries.forEach(([, offset, kind], index) => {
    if (kind !== "n") return;
    const start = Number(offset);
    objects.set(first + index, pdf.slice(start, pdf.indexOf("endobj", start)));
  });
  return objects;
}

function arrayOf(text: string, key: string): string | undefined {
  return new RegExp(String.raw`/${key}\s*\[([^\]]*)\]`).exec(text)?.[1];
}

function tokensOf(text: string | undefined): string[] {
  return (text ?? "").trim().split(/\s+/);
}

/** The object numbers of the references `n 0 R` in `text`. */
function referencesIn(text: string | undefined): number[] {
  const tokens = tokensOf(text);
  return tokens.flatMap((token, index) => (tokens[index + 2] === "R" ? [Number(token)] : []));
}

function numbersIn(text: string | undefined): number[] {
  return tokensOf(text).map(Number);
}

function objectOf(objects: ReadonlyMap<number, string>, number: number | undefined): string {
  const text = number === undefined ? undefined : objects.get(number);
  if (text === undefined) throw new Error(`The PDF has no object ${String(number)}.`);
  return text;
}

/** The leaves of the page tree under `node`, in reading order. */
function pageObjects(objects: ReadonlyMap<number, string>, node: string): string[] {
  if (!/\/Type\s*\/Pages\b/.test(node)) return [node];
  return referencesIn(arrayOf(node, "Kids")).flatMap((kid) => pageObjects(objects, objectOf(objects, kid)));
}

/** A PDF literal string's text: a backslash escapes the character after it. */
function literal(text: string): string {
  return text.replaceAll(/\\(.)/g, "$1");
}

function linkOf(annotation: string, height: number, appOrigin: string): PrintedLink {
  const [x1 = Number.NaN, y1 = Number.NaN, x2 = Number.NaN, y2 = Number.NaN] = numbersIn(arrayOf(annotation, "Rect"));
  const uri = /\/URI\s*\(((?:\\.|[^\\)])*)\)/.exec(annotation)?.[1];
  let href = uri === undefined ? "(within the document)" : literal(uri);
  if (href.startsWith(`${appOrigin}/`)) href = href.slice(appOrigin.length);
  return { href, top: height - Math.max(y1, y2), bottom: height - Math.min(y1, y2), left: Math.min(x1, x2) };
}

/** The pages of a Chromium PDF, each with its height and its links in the order Chromium wrote them. */
export function printedPagesOf(pdf: Buffer, appOrigin: string): PrintedPage[] {
  const text = pdf.toString("latin1");
  const objects = pdfObjects(text);
  const root = /\/Root\s+(\d+)\s+\d+\s+R\b/.exec(text.slice(text.lastIndexOf("trailer")))?.[1];
  const catalog = objectOf(objects, root === undefined ? undefined : Number(root));
  const tree = objectOf(objects, referencesIn(/\/Pages\s+\d+\s+\d+\s+R\b/.exec(catalog)?.[0])[0]);
  return pageObjects(objects, tree).map((page) => {
    const height = numbersIn(arrayOf(page, "MediaBox"))[3] ?? Number.NaN;
    const links = referencesIn(arrayOf(page, "Annots"))
      .map((number) => objectOf(objects, number))
      .filter((annotation) => /\/Subtype\s*\/Link\b/.test(annotation))
      .map((annotation) => linkOf(annotation, height, appOrigin));
    return { height, links };
  });
}

/** Prints the page to PDF, as Chromium prints it on Letter paper, and reads its pages back. */
export async function printToPdf(page: Page): Promise<PrintedPage[]> {
  const pages = printedPagesOf(await page.pdf(), new URL(page.url()).origin);
  expect(pages.length, "the PDF has no pages").toBeGreaterThan(0);
  return pages;
}

/**
 * Waits until nothing in the main content is loading and every animation that ends has ended. Chromium writes no link
 * for an anchor under a running filter, and content that is still fading in prints faded.
 */
export async function settleForPrint(page: Page): Promise<void> {
  await expect(page.locator("main [aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const ending = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY);
    await Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)));
  });
}
