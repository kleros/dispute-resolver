import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

function renderMarkdown(source: string) {
  return render(<SafeMarkdown source={source} testId="case-description" />).getByTestId("case-description");
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

  it("12: puts the parity test ID and the caller's class on its root", () => {
    render(<SafeMarkdown source="text" className="custom" testId="evidence-description" />);
    expect(screen.getByTestId("evidence-description")).toHaveClass("custom");
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
