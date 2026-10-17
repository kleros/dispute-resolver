/* eslint-disable sonarjs/no-clear-text-protocols -- the corpus exercises plain http:// URLs on purpose. */
/**
 * The markdown corpus of ARCHITECTURE.md 9.2 and what today's renderer makes of it.
 *
 * `legacy` was recorded on 2026-10-14 by rendering each `source` with `react-markdown` 4.2.2 (and 4.3.1, the version
 * today's lockfile resolves; both gave byte-identical HTML; the three `reference-undefined*` entries with 4.2.2 only) on React 17.0.0 with `react-dom/server`'s
 * `renderToStaticMarkup` and default options, in a scratch install outside the repository. `text` is the rendered
 * `textContent` with whitespace runs collapsed; `links` and `images` are every `<a>` and `<img>` in document order.
 * Today's `uriTransformer` writes `javascript:void(0)` for a refused link, which is recorded as rendered.
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

export const MARKDOWN_CORPUS: readonly MarkdownCorpusEntry[] = [
  {
    id: "paragraphs",
    source: "First paragraph.\n\nSecond paragraph with a soft\nline break and a hard  \nbreak.",
    legacy: {
      text: "First paragraph.Second paragraph with a soft line break and a hardbreak.",
      links: [],
      images: [],
    },
  },
  {
    id: "headings",
    source: "# Title\n\nSome text.\n\n## Subtitle\n\nSetext heading\n==============\n\nMore.",
    legacy: {
      text: "TitleSome text.SubtitleSetext headingMore.",
      links: [],
      images: [],
    },
  },
  {
    id: "emphasis",
    source: "Some *emphasis*, __strong__, `code` and ***both***.",
    legacy: {
      text: "Some emphasis, strong, code and both.",
      links: [],
      images: [],
    },
  },
  {
    id: "intraword-underscore",
    source: "snake_case_name and foo_bar_baz and 2*3*4.",
    legacy: {
      text: "snake_case_name and foo_bar_baz and 234.",
      links: [],
      images: [],
    },
  },
  {
    id: "lists",
    source: "- one\n- two\n  - nested\n\n3. three\n4. four\n\n* star\n+ plus",
    legacy: {
      text: "onetwonestedthreefourstarplus",
      links: [],
      images: [],
    },
  },
  {
    id: "table",
    source: "| Party | Claim |\n| --- | :---: |\n| Alice | 10 ETH |\n| Bob | `none` |",
    legacy: {
      text: "PartyClaimAlice10 ETHBobnone",
      links: [],
      images: [],
    },
  },
  {
    id: "table-no-leading-pipe",
    source: "Party | Claim\n--- | ---\nAlice | 10 ETH",
    legacy: {
      text: "PartyClaimAlice10 ETH",
      links: [],
      images: [],
    },
  },
  {
    id: "strikethrough-double",
    source: "This is ~~struck~~ text.",
    legacy: {
      text: "This is struck text.",
      links: [],
      images: [],
    },
  },
  {
    id: "strikethrough-single",
    source: "This is ~single~ tilde.",
    legacy: {
      text: "This is ~single~ tilde.",
      links: [],
      images: [],
    },
  },
  {
    id: "literal-https-url",
    source: "See https://kleros.io/terms for details.",
    legacy: {
      text: "See https://kleros.io/terms for details.",
      links: [
        {
          text: "https://kleros.io/terms",
          href: "https://kleros.io/terms",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-http-url",
    source: "Old site http://example.com/page here.",
    legacy: {
      text: "Old site http://example.com/page here.",
      links: [
        {
          text: "http://example.com/page",
          href: "http://example.com/page",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-www-url",
    source: "Visit www.example.com today.",
    legacy: {
      text: "Visit www.example.com today.",
      links: [],
      images: [],
    },
  },
  {
    id: "literal-url-trailing-punctuation",
    source: "Ends with a URL https://example.com/a. And (https://example.com/b).",
    legacy: {
      text: "Ends with a URL https://example.com/a. And (https://example.com/b).",
      links: [
        {
          text: "https://example.com/a",
          href: "https://example.com/a",
        },
        {
          text: "https://example.com/b",
          href: "https://example.com/b",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-email",
    source: "Write to contact@kleros.io please.",
    legacy: {
      text: "Write to contact@kleros.io please.",
      links: [],
      images: [],
    },
  },
  {
    id: "autolink-angle",
    source: "Angle <https://kleros.io> and <mailto:a@b.co>.",
    legacy: {
      text: "Angle https://kleros.io and a@b.co.",
      links: [
        {
          text: "https://kleros.io",
          href: "https://kleros.io",
        },
        {
          text: "a@b.co",
          href: "mailto:a@b.co",
        },
      ],
      images: [],
    },
  },
  {
    id: "task-list",
    source: "- [ ] open task\n- [x] done task",
    legacy: {
      text: "open taskdone task",
      links: [],
      images: [],
    },
  },
  {
    id: "footnote",
    source: "A claim[^1].\n\n[^1]: The footnote text.",
    legacy: {
      text: "A claim^1.^1: The footnote text.",
      links: [
        {
          text: "^1",
          href: "",
        },
        {
          text: "^1",
          href: "",
        },
      ],
      images: [],
    },
  },
  {
    id: "raw-html-img",
    source: "<img src=x onerror=alert(1)>",
    legacy: {
      text: "<img src=x onerror=alert(1)>",
      links: [],
      images: [],
    },
  },
  {
    id: "raw-html-inline",
    source: "Some <b>bold</b> and <script>alert(1)</script> inline.",
    legacy: {
      text: "Some <b>bold</b> and <script>alert(1)</script> inline.",
      links: [],
      images: [],
    },
  },
  {
    id: "raw-html-block",
    source: "<div>\nblock html\n</div>\n\nAfter.",
    legacy: {
      text: "<div> block html </div>After.",
      links: [],
      images: [],
    },
  },
  {
    id: "html-comment",
    source: "Before <!-- hidden --> after.",
    legacy: {
      text: "Before <!-- hidden --> after.",
      links: [],
      images: [],
    },
  },
  {
    id: "javascript-link",
    source: "[click](javascript:alert(1))",
    legacy: {
      text: "click",
      links: [
        {
          text: "click",
          href: "javascript:void(0)",
        },
      ],
      images: [],
    },
  },
  {
    id: "data-link",
    source: "[data](data:text/html;base64,PHNjcmlwdD4=)",
    legacy: {
      text: "data",
      links: [
        {
          text: "data",
          href: "javascript:void(0)",
        },
      ],
      images: [],
    },
  },
  {
    id: "mailto-tel-links",
    source: "[mail](mailto:a@b.co) and [call](tel:+123)",
    legacy: {
      text: "mail and call",
      links: [
        {
          text: "mail",
          href: "mailto:a@b.co",
        },
        {
          text: "call",
          href: "tel:+123",
        },
      ],
      images: [],
    },
  },
  {
    id: "http-https-links",
    source: "[secure](https://kleros.io) and [plain](http://example.com)",
    legacy: {
      text: "secure and plain",
      links: [
        {
          text: "secure",
          href: "https://kleros.io",
        },
        {
          text: "plain",
          href: "http://example.com",
        },
      ],
      images: [],
    },
  },
  {
    id: "relative-link",
    source: "[relative](/cases/1) and [anchor](#top)",
    legacy: {
      text: "relative and anchor",
      links: [
        {
          text: "relative",
          href: "/cases/1",
        },
        {
          text: "anchor",
          href: "#top",
        },
      ],
      images: [],
    },
  },
  {
    id: "reference-link",
    source: '[ref link][r]\n\n[r]: https://kleros.io "Title"',
    legacy: {
      text: "ref link",
      links: [
        {
          text: "ref link",
          href: "https://kleros.io",
        },
      ],
      images: [],
    },
  },
  {
    id: "images",
    source: "![https image](https://example.com/a.png) ![http image](http://example.com/b.png) ![js](javascript:alert(1))",
    legacy: {
      text: "",
      links: [],
      images: [
        {
          alt: "https image",
          src: "https://example.com/a.png",
        },
        {
          alt: "http image",
          src: "http://example.com/b.png",
        },
        {
          alt: "js",
          src: "javascript:alert(1)",
        },
      ],
    },
  },
  {
    id: "code-fence",
    source: "```js\nconst a = 1 < 2;\n```\n\n~~~\ntilde fence\n~~~",
    legacy: {
      text: "const a = 1 < 2;tilde fence",
      links: [],
      images: [],
    },
  },
  {
    id: "indented-code",
    source: "Text\n\n    indented code\n\nAfter",
    legacy: {
      text: "Textindented codeAfter",
      links: [],
      images: [],
    },
  },
  {
    id: "blockquote",
    source: "> quoted\n> text\n\nAfter",
    legacy: {
      text: "quoted textAfter",
      links: [],
      images: [],
    },
  },
  {
    id: "thematic-break",
    source: "Above\n\n***\n\nBelow",
    legacy: {
      text: "AboveBelow",
      links: [],
      images: [],
    },
  },
  {
    id: "entities-escapes",
    source: "&amp; &copy; &#35; \\*not emphasis\\* \\<tag\\>",
    legacy: {
      text: "& © # *not emphasis* \\<tag>",
      links: [],
      images: [],
    },
  },
  {
    id: "line-break-backslash",
    source: "Line one\\\nLine two",
    legacy: {
      text: "Line one\\ Line two",
      links: [],
      images: [],
    },
  },
  {
    id: "unicode",
    source: "Árbitro — 仲裁 🧑‍⚖️",
    legacy: {
      text: "Árbitro — 仲裁 🧑‍⚖️",
      links: [],
      images: [],
    },
  },
  {
    id: "realistic-escrow",
    source:
      "**Escrow transaction**\n\nThe sender pays 1 ETH to the receiver for a website.\n\n- Deadline: 2021-01-01\n- Terms: https://example.com/terms\n\n| Field | Value |\n|---|---|\n| Amount | 1 ETH |\n\n~~Cancelled clause~~",
    legacy: {
      text: "Escrow transactionThe sender pays 1 ETH to the receiver for a website.Deadline: 2021-01-01Terms: https://example.com/termsFieldValueAmount1 ETHCancelled clause",
      links: [
        {
          text: "https://example.com/terms",
          href: "https://example.com/terms",
        },
      ],
      images: [],
    },
  },
  {
    id: "realistic-curate",
    source: "Does the item comply with the [listing policy](https://ipfs.kleros.io/ipfs/QmPolicy/policy.pdf)?\n\nwww.kleros.io lists it; see also http://kleros.io.",
    legacy: {
      text: "Does the item comply with the listing policy?www.kleros.io lists it; see also http://kleros.io.",
      links: [
        {
          text: "listing policy",
          href: "https://ipfs.kleros.io/ipfs/QmPolicy/policy.pdf",
        },
        {
          text: "http://kleros.io",
          href: "http://kleros.io",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-mailto",
    source: "Bare mailto:a@b.co here.",
    legacy: {
      text: "Bare a@b.co here.",
      links: [
        {
          text: "a@b.co",
          href: "mailto:a@b.co",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-parens",
    source: "Wiki https://en.wikipedia.org/wiki/Foo_(bar) end.",
    legacy: {
      text: "Wiki https://en.wikipedia.org/wiki/Foo_(bar) end.",
      links: [
        {
          text: "https://en.wikipedia.org/wiki/Foo_(bar",
          href: "https://en.wikipedia.org/wiki/Foo_(bar",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-query",
    source: "Query https://example.com/?a=1&b=2, then text.",
    legacy: {
      text: "Query https://example.com/?a=1&b=2, then text.",
      links: [
        {
          text: "https://example.com/?a=1&b=2",
          href: "https://example.com/?a=1&b=2",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-in-link",
    source: "[https://a.com](https://b.com)",
    legacy: {
      text: "https://a.com",
      links: [
        {
          text: "https://a.com",
          href: "https://b.com",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-ftp",
    source: "ftp://example.com/file",
    legacy: {
      text: "ftp://example.com/file",
      links: [],
      images: [],
    },
  },
  {
    id: "footnote-unreferenced",
    source: "Text.\n\n[^note]: Orphan definition.",
    legacy: {
      text: "Text.^note: Orphan definition.",
      links: [
        {
          text: "^note",
          href: "",
        },
      ],
      images: [],
    },
  },
  {
    id: "strike-in-table",
    source: "| a |\n|---|\n| ~~x~~ |",
    legacy: {
      text: "ax",
      links: [],
      images: [],
    },
  },
  {
    id: "literal-url-uppercase",
    source: "HTTPS://EXAMPLE.COM/X",
    legacy: {
      text: "HTTPS://EXAMPLE.COM/X",
      links: [
        {
          text: "HTTPS://EXAMPLE.COM/X",
          href: "HTTPS://EXAMPLE.COM/X",
        },
      ],
      images: [],
    },
  },
  {
    id: "table-extra-cells-then-text",
    source: "a | b\n--- | ---\n1 | 2 | 3\nafter line",
    legacy: {
      text: "ab123after line",
      links: [],
      images: [],
    },
  },
  {
    id: "table-in-blockquote",
    source: "> | a | b |\n> |---|---|\n> | 1 | 2 |",
    legacy: {
      text: "ab12",
      links: [],
      images: [],
    },
  },
  {
    id: "table-in-list-escaped-pipe",
    source: "- item\n\n  | a | b |\n  |---|---|\n  | x \\| y | z |",
    legacy: {
      text: "itemabx | yz",
      links: [],
      images: [],
    },
  },
  {
    id: "table-code-pipe",
    source: "| a | b |\n|---|---|\n| `x|y` | z |",
    legacy: {
      text: "abx|yz",
      links: [],
      images: [],
    },
  },
  {
    id: "table-empty-cells",
    source: "|a|b|\n|-|-|\n||y|\n|x||",
    legacy: {
      text: "abyx",
      links: [],
      images: [],
    },
  },
  {
    id: "table-align-then-text",
    source: "| a |\n| :-: |\n| x |\nplain",
    legacy: {
      text: "axplain",
      links: [],
      images: [],
    },
  },
  {
    id: "table-after-text",
    source: "Intro\n| a | b |\n|---|---|",
    legacy: {
      text: "Intro | a | b | |---|---|",
      links: [],
      images: [],
    },
  },
  {
    id: "table-crlf",
    source: "| a |\r\n|---|\r\n| x |\r\n\r\n~~s~~ https://a.com",
    legacy: {
      text: "axs https://a.com",
      links: [
        {
          text: "https://a.com",
          href: "https://a.com",
        },
      ],
      images: [],
    },
  },
  {
    id: "strike-around-strong",
    source: "~~**bold** strike~~ after",
    legacy: {
      text: "bold strike after",
      links: [],
      images: [],
    },
  },
  {
    id: "strike-escaped",
    source: "\\~~not struck~~",
    legacy: {
      text: "~~not struck~~",
      links: [],
      images: [],
    },
  },
  {
    id: "strike-entity",
    source: "&#126;&#126;not struck~~",
    legacy: {
      text: "~~not struck~~",
      links: [],
      images: [],
    },
  },
  {
    id: "strike-spaced",
    source: "~~ spaced~~ and ~~ok ~~ and ~~ok~~",
    legacy: {
      text: "~~ spaced~~ and ok ~~ and ~~ok",
      links: [],
      images: [],
    },
  },
  {
    id: "strike-around-url",
    source: "~~see https://a.com~~",
    legacy: {
      text: "see https://a.com",
      links: [
        {
          text: "https://a.com",
          href: "https://a.com",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-uppercase-mid",
    source: "see HTTPS://EXAMPLE.COM mid",
    legacy: {
      text: "see HTTPS://EXAMPLE.COM mid",
      links: [],
      images: [],
    },
  },
  {
    id: "literal-url-uppercase-after-strong",
    source: "**b**HTTPS://EXAMPLE.COM after",
    legacy: {
      text: "bHTTPS://EXAMPLE.COM after",
      links: [
        {
          text: "HTTPS://EXAMPLE.COM",
          href: "HTTPS://EXAMPLE.COM",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-tildes",
    source: "https://a.com/~~x~~ y",
    legacy: {
      text: "https://a.com/x y",
      links: [
        {
          text: "https://a.com/x",
          href: "https://a.com/~~x~~",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-emphasis-markers",
    source: "x https://a.com/__init__.py y",
    legacy: {
      text: "x https://a.com/init.py y",
      links: [
        {
          text: "https://a.com/init.py",
          href: "https://a.com/__init__.py",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-entity",
    source: "Query https://example.com/?a=1&amp;b=2 end",
    legacy: {
      text: "Query https://example.com/?a=1&b=2 end",
      links: [
        {
          text: "https://example.com/?a=1&b=2",
          href: "https://example.com/?a=1&b=2",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-url-in-emphasis",
    source: "*https://a.com* <https://x.com> www.x.com",
    legacy: {
      text: "https://a.com https://x.com www.x.com",
      links: [
        {
          text: "https://a.com",
          href: "https://a.com",
        },
        {
          text: "https://x.com",
          href: "https://x.com",
        },
      ],
      images: [],
    },
  },
  {
    id: "literal-mailto-without-at",
    source: "mailto:nobody here mailto:a@b",
    legacy: {
      text: "mailto:nobody here a@b",
      links: [
        {
          text: "a@b",
          href: "mailto:a@b",
        },
      ],
      images: [],
    },
  },
  {
    id: "task-list-ordered",
    source: "1. [x] done\n2. [ ] open",
    legacy: {
      text: "doneopen",
      links: [],
      images: [],
    },
  },
  {
    id: "task-list-no-text",
    source: "- [x]\n- [X] Upper",
    legacy: {
      text: "xUpper",
      links: [
        {
          text: "x",
          href: "",
        },
      ],
      images: [],
    },
  },
  {
    id: "reference-undefined",
    source: "See [1] and a[0].",
    legacy: {
      text: "See 1 and a0.",
      links: [
        {
          text: "1",
          href: "",
        },
        {
          text: "0",
          href: "",
        },
      ],
      images: [],
    },
  },
  {
    id: "reference-undefined-forms",
    source: "Refs [1][2], [a] [b], [c][] and [x [y] z]; \\[kept] and [] stays.",
    legacy: {
      text: "Refs 1, a, c and [x y z]; [kept] and [] stays.",
      links: [
        {
          text: "1",
          href: "",
        },
        {
          text: "a",
          href: "",
        },
        {
          text: "c",
          href: "",
        },
        {
          text: "y",
          href: "",
        },
      ],
      images: [],
    },
  },
  {
    id: "reference-undefined-label",
    source: "Cited [https://kleros.io] and [~~old~~ text].",
    legacy: {
      text: "Cited https://kleros.io and old text.",
      links: [
        {
          text: "https://kleros.io",
          href: "",
        },
        {
          text: "old text",
          href: "",
        },
      ],
      images: [],
    },
  },
];
