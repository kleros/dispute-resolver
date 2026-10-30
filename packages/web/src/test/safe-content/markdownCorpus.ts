/* eslint-disable sonarjs/no-clear-text-protocols -- the corpus exercises plain http:// URLs on purpose. */
/**
 * `legacy` is what `react-markdown` 4.2.2 on React 17.0.0 renders for each `source` (`renderToStaticMarkup`, default
 * options), recorded on 2026-10-14. `text` is the rendered `textContent` with whitespace runs collapsed; `links` and
 * `images` are every `<a>` and `<img>` in document order. That renderer writes `javascript:void(0)` for a refused link,
 * which is recorded as rendered.
 */
export interface LegacyRendering {
  readonly text: string;
  readonly links: readonly { readonly text: string; readonly href: string | null }[];
  readonly images: readonly { readonly alt: string | null; readonly src: string | null }[];
}

export interface MarkdownCorpusEntry {
  readonly id: string;
  readonly source: string;
  readonly legacy: LegacyRendering;
}

/** One recorded case: `text` is its legacy rendering's text; `links` and `images` are empty unless given. */
interface RecordedCase {
  readonly id: string;
  readonly source: string;
  readonly text: string;
  readonly links?: LegacyRendering["links"];
  readonly images?: LegacyRendering["images"];
}

const CASES: readonly RecordedCase[] = [
  {
    id: "paragraphs",
    source: "First paragraph.\n\nSecond paragraph with a soft\nline break and a hard  \nbreak.",
    text: "First paragraph.Second paragraph with a soft line break and a hardbreak.",
  },
  { id: "headings", source: "# Title\n\nSome text.\n\n## Subtitle\n\nSetext heading\n==============\n\nMore.", text: "TitleSome text.SubtitleSetext headingMore." },
  { id: "emphasis", source: "Some *emphasis*, __strong__, `code` and ***both***.", text: "Some emphasis, strong, code and both." },
  { id: "intraword-underscore", source: "snake_case_name and foo_bar_baz and 2*3*4.", text: "snake_case_name and foo_bar_baz and 234." },
  { id: "lists", source: "- one\n- two\n  - nested\n\n3. three\n4. four\n\n* star\n+ plus", text: "onetwonestedthreefourstarplus" },
  { id: "table", source: "| Party | Claim |\n| --- | :---: |\n| Alice | 10 ETH |\n| Bob | `none` |", text: "PartyClaimAlice10 ETHBobnone" },
  { id: "table-no-leading-pipe", source: "Party | Claim\n--- | ---\nAlice | 10 ETH", text: "PartyClaimAlice10 ETH" },
  { id: "strikethrough-double", source: "This is ~~struck~~ text.", text: "This is struck text." },
  { id: "strikethrough-single", source: "This is ~single~ tilde.", text: "This is ~single~ tilde." },
  {
    id: "literal-https-url",
    source: "See https://kleros.io/terms for details.",
    text: "See https://kleros.io/terms for details.",
    links: [{ text: "https://kleros.io/terms", href: "https://kleros.io/terms" }],
  },
  {
    id: "literal-http-url",
    source: "Old site http://example.com/page here.",
    text: "Old site http://example.com/page here.",
    links: [{ text: "http://example.com/page", href: "http://example.com/page" }],
  },
  { id: "literal-www-url", source: "Visit www.example.com today.", text: "Visit www.example.com today." },
  {
    id: "literal-url-trailing-punctuation",
    source: "Ends with a URL https://example.com/a. And (https://example.com/b).",
    text: "Ends with a URL https://example.com/a. And (https://example.com/b).",
    links: [
      { text: "https://example.com/a", href: "https://example.com/a" },
      { text: "https://example.com/b", href: "https://example.com/b" },
    ],
  },
  { id: "literal-email", source: "Write to contact@kleros.io please.", text: "Write to contact@kleros.io please." },
  {
    id: "autolink-angle",
    source: "Angle <https://kleros.io> and <mailto:a@b.co>.",
    text: "Angle https://kleros.io and a@b.co.",
    links: [
      { text: "https://kleros.io", href: "https://kleros.io" },
      { text: "a@b.co", href: "mailto:a@b.co" },
    ],
  },
  { id: "task-list", source: "- [ ] open task\n- [x] done task", text: "open taskdone task" },
  {
    id: "footnote",
    source: "A claim[^1].\n\n[^1]: The footnote text.",
    text: "A claim^1.^1: The footnote text.",
    links: [
      { text: "^1", href: "" },
      { text: "^1", href: "" },
    ],
  },
  { id: "raw-html-img", source: "<img src=x onerror=alert(1)>", text: "<img src=x onerror=alert(1)>" },
  { id: "raw-html-inline", source: "Some <b>bold</b> and <script>alert(1)</script> inline.", text: "Some <b>bold</b> and <script>alert(1)</script> inline." },
  { id: "raw-html-block", source: "<div>\nblock html\n</div>\n\nAfter.", text: "<div> block html </div>After." },
  { id: "html-comment", source: "Before <!-- hidden --> after.", text: "Before <!-- hidden --> after." },
  { id: "javascript-link", source: "[click](javascript:alert(1))", text: "click", links: [{ text: "click", href: "javascript:void(0)" }] },
  { id: "data-link", source: "[data](data:text/html;base64,PHNjcmlwdD4=)", text: "data", links: [{ text: "data", href: "javascript:void(0)" }] },
  {
    id: "mailto-tel-links",
    source: "[mail](mailto:a@b.co) and [call](tel:+123)",
    text: "mail and call",
    links: [
      { text: "mail", href: "mailto:a@b.co" },
      { text: "call", href: "tel:+123" },
    ],
  },
  {
    id: "http-https-links",
    source: "[secure](https://kleros.io) and [plain](http://example.com)",
    text: "secure and plain",
    links: [
      { text: "secure", href: "https://kleros.io" },
      { text: "plain", href: "http://example.com" },
    ],
  },
  {
    id: "relative-link",
    source: "[relative](/cases/1) and [anchor](#top)",
    text: "relative and anchor",
    links: [
      { text: "relative", href: "/cases/1" },
      { text: "anchor", href: "#top" },
    ],
  },
  { id: "reference-link", source: '[ref link][r]\n\n[r]: https://kleros.io "Title"', text: "ref link", links: [{ text: "ref link", href: "https://kleros.io" }] },
  {
    id: "images",
    source: "![https image](https://example.com/a.png) ![http image](http://example.com/b.png) ![js](javascript:alert(1))",
    text: "",
    images: [
      { alt: "https image", src: "https://example.com/a.png" },
      { alt: "http image", src: "http://example.com/b.png" },
      { alt: "js", src: "javascript:alert(1)" },
    ],
  },
  { id: "code-fence", source: "```js\nconst a = 1 < 2;\n```\n\n~~~\ntilde fence\n~~~", text: "const a = 1 < 2;tilde fence" },
  { id: "indented-code", source: "Text\n\n    indented code\n\nAfter", text: "Textindented codeAfter" },
  { id: "blockquote", source: "> quoted\n> text\n\nAfter", text: "quoted textAfter" },
  { id: "thematic-break", source: "Above\n\n***\n\nBelow", text: "AboveBelow" },
  { id: "entities-escapes", source: String.raw`&amp; &copy; &#35; \*not emphasis\* \<tag\>`, text: String.raw`& © # *not emphasis* \<tag>` },
  { id: "line-break-backslash", source: "Line one\\\nLine two", text: String.raw`Line one\ Line two` },
  { id: "unicode", source: "Árbitro — 仲裁 🧑‍⚖️", text: "Árbitro — 仲裁 🧑‍⚖️" },
  {
    id: "realistic-escrow",
    source:
      "**Escrow transaction**\n\nThe sender pays 1 ETH to the receiver for a website.\n\n- Deadline: 2021-01-01\n- Terms: https://example.com/terms\n\n| Field | Value |\n|---|---|\n| Amount | 1 ETH |\n\n~~Cancelled clause~~",
    text: "Escrow transactionThe sender pays 1 ETH to the receiver for a website.Deadline: 2021-01-01Terms: https://example.com/termsFieldValueAmount1 ETHCancelled clause",
    links: [{ text: "https://example.com/terms", href: "https://example.com/terms" }],
  },
  {
    id: "realistic-curate",
    source: "Does the item comply with the [listing policy](https://ipfs.kleros.io/ipfs/QmPolicy/policy.pdf)?\n\nwww.kleros.io lists it; see also http://kleros.io.",
    text: "Does the item comply with the listing policy?www.kleros.io lists it; see also http://kleros.io.",
    links: [
      { text: "listing policy", href: "https://ipfs.kleros.io/ipfs/QmPolicy/policy.pdf" },
      { text: "http://kleros.io", href: "http://kleros.io" },
    ],
  },
  { id: "literal-mailto", source: "Bare mailto:a@b.co here.", text: "Bare a@b.co here.", links: [{ text: "a@b.co", href: "mailto:a@b.co" }] },
  {
    id: "literal-url-parens",
    source: "Wiki https://en.wikipedia.org/wiki/Foo_(bar) end.",
    text: "Wiki https://en.wikipedia.org/wiki/Foo_(bar) end.",
    links: [{ text: "https://en.wikipedia.org/wiki/Foo_(bar", href: "https://en.wikipedia.org/wiki/Foo_(bar" }],
  },
  {
    id: "literal-url-query",
    source: "Query https://example.com/?a=1&b=2, then text.",
    text: "Query https://example.com/?a=1&b=2, then text.",
    links: [{ text: "https://example.com/?a=1&b=2", href: "https://example.com/?a=1&b=2" }],
  },
  { id: "literal-url-in-link", source: "[https://a.com](https://b.com)", text: "https://a.com", links: [{ text: "https://a.com", href: "https://b.com" }] },
  { id: "literal-ftp", source: "ftp://example.com/file", text: "ftp://example.com/file" },
  { id: "footnote-unreferenced", source: "Text.\n\n[^note]: Orphan definition.", text: "Text.^note: Orphan definition.", links: [{ text: "^note", href: "" }] },
  { id: "strike-in-table", source: "| a |\n|---|\n| ~~x~~ |", text: "ax" },
  { id: "literal-url-uppercase", source: "HTTPS://EXAMPLE.COM/X", text: "HTTPS://EXAMPLE.COM/X", links: [{ text: "HTTPS://EXAMPLE.COM/X", href: "HTTPS://EXAMPLE.COM/X" }] },
  { id: "table-extra-cells-then-text", source: "a | b\n--- | ---\n1 | 2 | 3\nafter line", text: "ab123after line" },
  { id: "table-in-blockquote", source: "> | a | b |\n> |---|---|\n> | 1 | 2 |", text: "ab12" },
  { id: "table-in-list-escaped-pipe", source: "- item\n\n  | a | b |\n  |---|---|\n  | x \\| y | z |", text: "itemabx | yz" },
  { id: "table-code-pipe", source: "| a | b |\n|---|---|\n| `x|y` | z |", text: "abx|yz" },
  { id: "table-empty-cells", source: "|a|b|\n|-|-|\n||y|\n|x||", text: "abyx" },
  { id: "table-align-then-text", source: "| a |\n| :-: |\n| x |\nplain", text: "axplain" },
  { id: "table-after-text", source: "Intro\n| a | b |\n|---|---|", text: "Intro | a | b | |---|---|" },
  { id: "table-crlf", source: "| a |\r\n|---|\r\n| x |\r\n\r\n~~s~~ https://a.com", text: "axs https://a.com", links: [{ text: "https://a.com", href: "https://a.com" }] },
  { id: "strike-around-strong", source: "~~**bold** strike~~ after", text: "bold strike after" },
  { id: "strike-escaped", source: String.raw`\~~not struck~~`, text: "~~not struck~~" },
  { id: "strike-entity", source: "&#126;&#126;not struck~~", text: "~~not struck~~" },
  { id: "strike-spaced", source: "~~ spaced~~ and ~~ok ~~ and ~~ok~~", text: "~~ spaced~~ and ok ~~ and ~~ok" },
  { id: "strike-around-url", source: "~~see https://a.com~~", text: "see https://a.com", links: [{ text: "https://a.com", href: "https://a.com" }] },
  { id: "literal-url-uppercase-mid", source: "see HTTPS://EXAMPLE.COM mid", text: "see HTTPS://EXAMPLE.COM mid" },
  {
    id: "literal-url-uppercase-after-strong",
    source: "**b**HTTPS://EXAMPLE.COM after",
    text: "bHTTPS://EXAMPLE.COM after",
    links: [{ text: "HTTPS://EXAMPLE.COM", href: "HTTPS://EXAMPLE.COM" }],
  },
  { id: "literal-url-tildes", source: "https://a.com/~~x~~ y", text: "https://a.com/x y", links: [{ text: "https://a.com/x", href: "https://a.com/~~x~~" }] },
  {
    id: "literal-url-emphasis-markers",
    source: "x https://a.com/__init__.py y",
    text: "x https://a.com/init.py y",
    links: [{ text: "https://a.com/init.py", href: "https://a.com/__init__.py" }],
  },
  {
    id: "literal-url-entity",
    source: "Query https://example.com/?a=1&amp;b=2 end",
    text: "Query https://example.com/?a=1&b=2 end",
    links: [{ text: "https://example.com/?a=1&b=2", href: "https://example.com/?a=1&b=2" }],
  },
  {
    id: "literal-url-in-emphasis",
    source: "*https://a.com* <https://x.com> www.x.com",
    text: "https://a.com https://x.com www.x.com",
    links: [
      { text: "https://a.com", href: "https://a.com" },
      { text: "https://x.com", href: "https://x.com" },
    ],
  },
  { id: "literal-mailto-without-at", source: "mailto:nobody here mailto:a@b", text: "mailto:nobody here a@b", links: [{ text: "a@b", href: "mailto:a@b" }] },
  { id: "task-list-ordered", source: "1. [x] done\n2. [ ] open", text: "doneopen" },
  { id: "task-list-no-text", source: "- [x]\n- [X] Upper", text: "xUpper", links: [{ text: "x", href: "" }] },
  {
    id: "reference-undefined",
    source: "See [1] and a[0].",
    text: "See 1 and a0.",
    links: [
      { text: "1", href: "" },
      { text: "0", href: "" },
    ],
  },
  {
    id: "reference-undefined-forms",
    source: String.raw`Refs [1][2], [a] [b], [c][] and [x [y] z]; \[kept] and [] stays.`,
    text: "Refs 1, a, c and [x y z]; [kept] and [] stays.",
    links: [
      { text: "1", href: "" },
      { text: "a", href: "" },
      { text: "c", href: "" },
      { text: "y", href: "" },
    ],
  },
  {
    id: "reference-undefined-label",
    source: "Cited [https://kleros.io] and [~~old~~ text].",
    text: "Cited https://kleros.io and old text.",
    links: [
      { text: "https://kleros.io", href: "" },
      { text: "old text", href: "" },
    ],
  },
];

export const MARKDOWN_CORPUS: readonly MarkdownCorpusEntry[] = CASES.map(({ id, source, text, links = [], images = [] }) => ({ id, source, legacy: { text, links, images } }));
