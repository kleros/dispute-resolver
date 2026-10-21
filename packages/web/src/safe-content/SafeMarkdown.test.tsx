import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

/** The markdown's root element, the one element `SafeMarkdown` renders around the content. */
function renderMarkdown(source: string, className?: string): HTMLElement {
  const root = render(<SafeMarkdown source={source} className={className} />).container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error("SafeMarkdown rendered no root element.");
  return root;
}

describe("SafeMarkdown raw HTML", () => {
  it("A11: renders <img src=x onerror=alert(1)> as text", () => {
    const root = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(root.querySelector("img")).toBeNull();
    expect(root).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("A11: renders inline and block HTML as text, never as elements", () => {
    const root = renderMarkdown('Some <b>bold</b> <script>alert(1)</script>\n\n<div onclick="alert(1)">\nblock\n</div>\n\n<iframe src="https://evil.example"></iframe>');
    expect(root.querySelector("b, script, div, iframe")).toBeNull();
    expect(root).toHaveTextContent("<script>alert(1)</script>");
    expect(root).toHaveTextContent('<div onclick="alert(1)">');
  });
});

describe("SafeMarkdown links", () => {
  it.each(["[x](javascript:alert(1))", "[x](JAVASCRIPT:alert(1))", "[x](data:text/html,hi)", "<javascript:alert(1)>", "[x][r]\n\n[r]: javascript:alert(1)"])(
    "A11: gives %j no javascript: or data: href",
    (source) => {
      const root = renderMarkdown(source);
      expect(root.querySelector("a")).toBeNull();
      expect(root.querySelector("[href]")).toBeNull();
    },
  );

  it("A11: keeps the label of a refused link as text", () => {
    expect(renderMarkdown("[click me](javascript:alert(1))")).toHaveTextContent("click me");
  });

  it.each([
    ["[a](https://kleros.io)", "https://kleros.io"],
    ["[a](http://example.com)", "http://example.com"],
    ["[a](mailto:a@b.co)", "mailto:a@b.co"],
    ["[a](tel:+123)", "tel:+123"],
    ["[a](/cases/1)", "/cases/1"],
    ["<https://kleros.io>", "https://kleros.io"],
  ])("D-31: opens %j in a new tab with rel noopener noreferrer", (source, href) => {
    const link = renderMarkdown(source).querySelector("a");
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("A11: keeps http:// description links as links (D-32 covers attachments and interfaces only)", () => {
    renderMarkdown("[plain](http://example.com/page)");
    expect(screen.getByRole("link", { name: "plain" })).toHaveAttribute("href", "http://example.com/page");
  });
});

describe("SafeMarkdown images", () => {
  it("D-31: renders an https image without a referrer and lazily", () => {
    const image = renderMarkdown("![diagram](https://example.com/a.png)").querySelector("img");
    expect(image).toHaveAttribute("src", "https://example.com/a.png");
    expect(image).toHaveAttribute("alt", "diagram");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it.each([
    "![alt text](http://example.com/a.png)",
    "![alt text](//example.com/a.png)",
    "![alt text](/a.png)",
    "![alt text](javascript:alert(1))",
    "![alt text](data:image/png;base64,AAAA)",
  ])("D-31: renders no image for %j, only its alt text", (source) => {
    const root = renderMarkdown(source);
    expect(root.querySelector("img")).toBeNull();
    expect(root).toHaveTextContent("alt text");
  });
});

describe("SafeMarkdown structure", () => {
  it("renders CommonMark structure through React", () => {
    const root = renderMarkdown("# Heading\n\nText with *emphasis* and `code`.\n\n- one\n- two\n\n> quote");
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(root.querySelector("em")).toHaveTextContent("emphasis");
    expect(root.querySelector("code")).toHaveTextContent("code");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(root.querySelector("blockquote")).toHaveTextContent("quote");
  });

  it("puts the caller's class on its root", () => {
    expect(renderMarkdown("text", "custom")).toHaveClass("custom");
  });

  it("renders nothing but its root for an empty source", () => {
    expect(renderMarkdown("")).toBeEmptyDOMElement();
  });
});

describe("SafeMarkdown GitHub-flavored syntax of today's renderer", () => {
  it("SC-01 §5.6: links a literal https URL in a new tab, as today", () => {
    renderMarkdown("Terms: https://example.com/terms.");
    const link = screen.getByRole("link", { name: "https://example.com/terms" });
    expect(link).toHaveAttribute("href", "https://example.com/terms");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("SC-01 §5.6: links a literal mailto: address under the address alone, and not www. or a bare e-mail", () => {
    const root = renderMarkdown("Write mailto:a@b.co, visit www.example.com or contact@kleros.io.");
    expect(screen.getByRole("link", { name: "a@b.co" })).toHaveAttribute("href", "mailto:a@b.co");
    expect(root.querySelectorAll("a")).toHaveLength(1);
  });

  it("SC-01 §5.6: keeps a literal URL inside a link label as the label", () => {
    renderMarkdown("[https://a.com](https://b.com)");
    expect(screen.getByRole("link", { name: "https://a.com" })).toHaveAttribute("href", "https://b.com");
  });

  it("§5.6: reads a literal URL before the emphasis inside it and renders one link, as today", () => {
    const root = renderMarkdown("https://x(*https://y*)");
    const links = [...root.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://x(*https://y*"]);
    expect(links[0]?.querySelector("em")).toHaveTextContent(/^https:\/\/y$/);
    expect(root.querySelector("p")).toHaveTextContent(/^https:\/\/x\(https:\/\/y\)$/);
  });

  it("§5.6: renders link syntax inside a link's label as text, as today", () => {
    const root = renderMarkdown("[x <https://a> *<b@c.co>*](https://y) and https://z(*[d](https://e)*), ~~https://z(*[f]*)~~\n\n[f]: https://g");
    expect([...root.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["x <https://a> <b@c.co>", "https://z([d](https://e))", "https://z([f]"]);
    expect([...root.querySelectorAll("a em")].map((emphasis) => emphasis.textContent)).toEqual(["<b@c.co>", "[d](https://e)", "[f]"]);
    expect(root.querySelector("p")).toHaveTextContent(/^x <https:\/\/a> <b@c\.co> and https:\/\/z\(\[d\]\(https:\/\/e\)\), https:\/\/z\(\[f\]\)$/);
  });

  it.each([
    ["https&#58;//x", "https://x"],
    ["https:/&#47;x", "https://x"],
    ["&#104;ttps://x", "https://x"],
    ["HTTP&#58;//example.com", "HTTP://example.com"],
    ["mailto&#58;a@b.co", "mailto:a@b.co"],
    ["http\\://example.com", "http://example.com"],
  ])("§5.6: a URL scheme written with a character reference or an escape (%j) is no link", (source, text) => {
    const root = renderMarkdown(`${source} and https://y`);
    expect([...root.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual(["https://y"]);
    expect(root).toHaveTextContent(`${text} and https://y`);
  });

  it("SC-01 §5.6: strikes through ~~text~~ but not ~single~ or escaped tildes", () => {
    const root = renderMarkdown("This is ~~struck~~ text, ~single~ and \\~~escaped~~.");
    expect([...root.querySelectorAll("del")].map((element) => element.textContent)).toEqual(["struck"]);
    expect(root).toHaveTextContent("~single~ and ~~escaped~~.");
  });

  it("SC-01 §5.6: finds syntax after characters outside the Basic Multilingual Plane", () => {
    const root = renderMarkdown("🧑‍⚖️🧑‍⚖️ ruled ~~twice~~");
    expect(root.querySelector("del")).toHaveTextContent("twice");
  });

  it("SC-01 §5.6: renders a pipe table with header cells, alignment and an escaped pipe", () => {
    const root = renderMarkdown("| Party | Claim |\n| --- | :---: |\n| Alice | 10 \\| 20 ETH |");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Party", "Claim"]);
    const cells = screen.getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["Alice", "10 | 20 ETH"]);
    expect(cells[1]).toHaveStyle({ textAlign: "center" });
    expect(root).not.toHaveTextContent("---");
  });

  it("SC-01 §5.6: ends the table at the first line without a pipe and keeps that line as a paragraph", () => {
    const root = renderMarkdown("a | b\n--- | ---\n1 | 2\nafter");
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["1", "2"]);
    expect(root.querySelector("p")).toHaveTextContent("after");
  });

  it("SC-01 §5.6: leaves pipe lines that follow other text as text, as today", () => {
    const root = renderMarkdown("Intro\n| a | b |\n|---|---|");
    expect(root.querySelector("table")).toBeNull();
    expect(root).toHaveTextContent("| a | b |");
  });

  it.each([
    ["a|b\n-&#124;-", "a|b -|-"],
    ["a|b\n-\\|-", "a|b -|-"],
    ["a|b\n&#45;|-", "a|b -|-"],
    ["a|b\n&#58;-|-", "a|b :-|-"],
  ])("§5.6: an alignment row with a pipe, dash or colon written as a reference or an escape (%j) is text, as today", (source, text) => {
    const root = renderMarkdown(source);
    expect(root.querySelector("table")).toBeNull();
    expect(root.querySelector("p")).toHaveTextContent(text);
  });

  it.each([["a&#124;b\n-|-"], ["a&#x7C;b\n-|-"]])("MC-12: a header row whose only pipe is a character reference (%j) is text, as today", (source) => {
    const root = renderMarkdown(source);
    expect(root.querySelector("table")).toBeNull();
    expect(root.querySelector("p")?.textContent).toBe("a|b\n-|-");
  });

  it("MC-12: a named reference to a pipe makes no row", () => {
    expect(renderMarkdown("a&vert;b\n-|-").querySelector("table")).toBeNull();
    expect(renderMarkdown("a&verbar;b\n-|-").querySelector("table")).toBeNull();
  });

  it("MC-12: a body row whose only pipe is a character reference ends the table, as today", () => {
    const root = renderMarkdown("a|b\n-|-\nc&#124;d");
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["a", "b"]);
    expect(screen.queryAllByRole("cell")).toEqual([]);
    const after = root.lastElementChild;
    expect(after?.tagName).toBe("P");
    expect(after?.textContent).toBe("c|d");
    expect(root.querySelectorAll("p")).toHaveLength(1);
  });

  it("MC-12: a literal pipe still makes the row and a referenced pipe stays inside its cell", () => {
    renderMarkdown("a&#124;b|c\n-|-");
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["a|b", "c"]);
  });

  it("MC-12, MC-12b: a backslash-escaped pipe still makes a row, with the escaped pipe inside its only cell, as today", () => {
    renderMarkdown("a\\|b\n-|-");
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["a|b"]);
  });

  it.each([
    ["a\\|b\n-|-", ["a|b"], []],
    ["| a \\| b |\n|---|---|", ["a | b"], []],
    ["a|b\n-|-|-", ["a", "b"], []],
    ["a|b\n-|-\nc|", ["a", "b"], ["c"]],
    ["a|b\n-|-\nc\\|d", ["a", "b"], ["c|d"]],
    ["a|b\n-|-\nc|d|e", ["a", "b"], ["c", "d", "e"]],
  ])("MC-12b: a row has only its own cells, never padded to the alignment row or the widest row (%j), as today", (source, header, body) => {
    renderMarkdown(source);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(header);
    expect(screen.queryAllByRole("cell").map((cell) => cell.textContent)).toEqual(body);
  });

  it("MC-12b: each cell takes the alignment of its column, and a cell past the alignment row has none, as today", () => {
    renderMarkdown(":a|b\n:-|-:\nc|d|e");
    expect(screen.getAllByRole("columnheader").map((cell) => cell.style.textAlign)).toEqual(["left", "right"]);
    expect(screen.getAllByRole("cell").map((cell) => cell.style.textAlign)).toEqual(["left", "right", ""]);
  });

  it("MC-12: a pipe written as a character reference makes no row when its text cannot be aligned with its source", () => {
    const root = renderMarkdown("a&#124;b &fjlig;j *c*\n-|-");
    expect(root.querySelector("table")).toBeNull();
    expect(root.querySelector("p")?.textContent).toBe("a|b fjj c\n-|-");
  });

  it.each([["a|b &fjlig;j *c*\n-|-"], ["a\\|b &fjlig;j *c*\n-|-"], ["&#124;a|b &fjlig;j *c*\n-|-"], ["a\\&#124;b|c &fjlig;j *c*\n-|-"], ["a&Vert;b|c &fjlig;j *c*\n-|-"]])(
    "MC-12: a pipe written as itself or as a backslash escape still makes a row when its text cannot be aligned with its source (%j)",
    (source) => {
      expect(renderMarkdown(source).querySelector("table")).not.toBeNull();
    },
  );

  it("MC-12: an unaligned text's pipes keep their order, so a literal pipe first and a referenced one after make no row", () => {
    const root = renderMarkdown("|a&#124;b &fjlig;j *c*\n-|-");
    expect(root.querySelector("table")).toBeNull();
    expect(root.querySelector("p")?.textContent).toBe("|a|b fjj c\n-|-");
  });

  it("MC-12: a body line cut from an unaligned text ends the table when its only pipe is a character reference", () => {
    const root = renderMarkdown("a|b\n-|-\nc|d *x*\ne|f\ng&#124;h &fjlig;j");
    expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
    const after = root.lastElementChild;
    expect(after?.tagName).toBe("P");
    expect(after?.textContent).toBe("g|h fjj");
  });

  it("SC-01 §5.6: renders task items as read-only checkboxes without their markers", () => {
    const root = renderMarkdown("- [ ] open task\n- [x] done task");
    const boxes = screen.getAllByRole("checkbox", { name: "Task" });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, true]);
    boxes.forEach((box) => {
      expect(box).toBeDisabled();
    });
    expect(root).not.toHaveTextContent("[x]");
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent.trim())).toEqual(["open task", "done task"]);
    items.forEach((item) => {
      expect(item).toHaveClass("list-none");
    });
  });

  it("SC-01 §5.6: reads Windows line endings as today", () => {
    renderMarkdown("| a |\r\n|---|\r\n| x |");
    expect(screen.getByRole("cell")).toHaveTextContent("x");
  });

  it("SC-01 A11: keeps raw HTML inside a table cell and a struck span as text", () => {
    const root = renderMarkdown("| a |\n|---|\n| <img src=x onerror=alert(1)> |\n\n~~<script>alert(1)</script>~~");
    expect(root.querySelector("img, script")).toBeNull();
    expect(screen.getByRole("cell")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(root.querySelector("del")).toHaveTextContent("<script>alert(1)</script>");
  });

  it("P-10: drops the brackets of a reference no definition names and renders no link, inside emphasis and tables too", () => {
    const root = renderMarkdown("See [1], *[a] [b]* and [^1].\n\n[^1]: The note.\n\n| [x] |\n|---|\n| [y][] |");
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("p")).toHaveTextContent("See 1, a and ^1.");
    expect(root.querySelector("em")).toHaveTextContent(/^a$/);
    expect(root).toHaveTextContent("^1: The note.");
    expect(screen.getByRole("columnheader")).toHaveTextContent(/^x$/);
    expect(screen.getByRole("cell")).toHaveTextContent(/^y$/);
  });

  it("P-10: a defined reference stays a link, and an escaped or empty bracket stays text", () => {
    const root = renderMarkdown("[Kleros] and \\[kept], [] and ![alt]\n\n[kleros]: https://kleros.io");
    expect([...root.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["Kleros", "https://kleros.io"]]);
    expect(root).toHaveTextContent("Kleros and [kept], [] and ![alt]");
  });

  it.each([
    ["[a <https://b>]", "a <https://b>"],
    ["[a <b@c.co>] d", "a <b@c.co> d"],
    ["x[<https://b>]", "x<https://b>"],
    ["[a <https://b>][]", "a <https://b>"],
    ["[a <https://b>] [c]", "a <https://b>"],
    ["[a][<https://b>]", "a"],
  ])("P-10 §5.6: an autolink in or after the label of an undefined reference is text, as today (%j)", (source, text) => {
    const root = renderMarkdown(source);
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("p")?.textContent).toBe(text);
  });

  it("P-10 §5.6: an autolink that emphasis or strikethrough holds in the label of an undefined reference is text, as today", () => {
    const root = renderMarkdown("[a *<https://b>*]\n\n[a ~~<https://b>~~]");
    expect(root.querySelector("a")).toBeNull();
    expect([...root.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual(["a <https://b>", "a <https://b>"]);
    expect(root.querySelector("em")).toHaveTextContent(/^<https:\/\/b>$/);
    expect(root.querySelector("del")).toHaveTextContent(/^<https:\/\/b>$/);
  });

  it.each([
    ["[a *[b](https://c)*]", "[a b]", ["b"]],
    ["[a *[b]*]", "[a b]", []],
    ["[a `[`]", "[a []", []],
    ["[a *<https://x/[>*]", "[a https://x/[]", ["https://x/["]],
    ["[a <https://x/[> d]", "[a https://x/[ d]", ["https://x/["]],
    ["[a *\\[x*]", "a [x", []],
  ])("P-10 §5.6: a bracket in a node inside the brackets of %j keeps them, as today, unless escaped", (source, text, links) => {
    const root = renderMarkdown(source);
    expect(root.querySelector("p")?.textContent).toBe(text);
    expect([...root.querySelectorAll("a")].map((link) => link.textContent)).toEqual(links);
  });

  it.each([
    ["[a `[` b] c][x]", "a [ b] c"],
    ["[a <https://x/[> b] c][x]", "a <https://x/[> b] c"],
  ])("P-10 §5.6: a `[` in a node's source opens a bracket, as today, so %j is one undefined reference", (source, text) => {
    const root = renderMarkdown(source);
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("p")?.textContent).toBe(text);
  });

  it("P-10 §5.6: a `[` in a code span takes the `]` after it, as today, so the brackets around it pair with nothing", () => {
    const root = renderMarkdown("[<mailto:c@d.co>`[`https://x][r]");
    expect([...root.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["c@d.co", "https://x"]);
    expect(root.querySelector("p")?.textContent).toBe("[c@d.co[https://x]r");
  });

  it("P-10 §5.6: a link or an image in the label of an undefined reference with an identifier stays inside it, as today", () => {
    const root = renderMarkdown("[a [b](https://c) d][x]\n\n[a ![i](https://c) d][x]");
    expect(root.querySelector("a")).toBeNull();
    expect([...root.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual(["a [b](https://c) d", "a  d"]);
    expect(root.querySelector("img")).toHaveAttribute("alt", "i");
  });

  it("P-10: a bare task marker is text without its brackets, as today, and no link", () => {
    const root = renderMarkdown("- [x]\n- [ ] open");
    expect(root.querySelector("a")).toBeNull();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(/^x$/);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("P-10: many unclosed brackets render as text in linear time", () => {
    const source = "[".repeat(50_000) + "x" + "]".repeat(10);
    const started = performance.now();
    const root = renderMarkdown(source);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(root.textContent).toContain("[".repeat(100));
  });
});

/** Renders `source` and returns its root with how long the render took, in milliseconds. */
function timedRender(source: string): { root: HTMLElement; elapsed: number } {
  const started = performance.now();
  const root = renderMarkdown(source);
  return { root, elapsed: performance.now() - started };
}

describe("SafeMarkdown on hostile descriptions", () => {
  it("§5.6: reads a 40,000-column alignment row in linear time", () => {
    const { root, elapsed } = timedRender("a|b\n" + "|-".repeat(40_000) + "|x");
    expect(elapsed).toBeLessThan(1_000);
    expect(root.querySelector("table")).toBeNull();
    expect(root.textContent).toContain("|-|-|x");
  });

  it("§5.6: walks a failed mailto: literal URL once, not again from each later mailto:", () => {
    const { root, elapsed } = timedRender("mailto:".repeat(7_000) + "x".repeat(50_000) + ")@a");
    expect(elapsed).toBeLessThan(1_000);
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toContain("x)@a");
  });

  it("§5.6: a failed mailto: still lets a strikethrough, an https URL and a later address inside it through", () => {
    const root = renderMarkdown("mailto:~~x~~)@a\n\nmailto:https://k.io)@a\n\nmailto:a)mailto:(x)@a\n\nmailto:x]mailto:y@z.co");
    expect(root.querySelector("del")).toHaveTextContent(/^x$/);
    expect([...root.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["https://k.io", "https://k.io"],
      ["(x)@a", "mailto:(x)@a"],
      ["y@z.co", "mailto:y@z.co"],
    ]);
  });

  it("§5.6: scans 300 levels of nested emphasis around 200,000 characters in linear time", () => {
    const { root, elapsed } = timedRender("*a ".repeat(300) + "x".repeat(200_000) + " a*".repeat(300));
    expect(elapsed).toBeLessThan(1_500);
    expect(root.querySelectorAll("em")).toHaveLength(300);
    expect(root.textContent).toContain("x".repeat(200_000));
  });
});
