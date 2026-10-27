import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseDisputeId } from "@dispute-resolver/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./SearchBox";
import type { DisputeSearch } from "./useDisputeSearch";

const LARGEST_ID = (2n ** 256n - 1n).toString();

interface Start {
  readonly pending?: string | null;
  readonly shownId?: bigint | null;
  readonly autoFocus?: boolean;
}

/**
 * Holds the typed text the way the page's search does, so typed keys build on each other, and refuses what it refuses:
 * a number above the largest dispute ID changes nothing.
 */
function renderSearch({ pending = null, shownId = null, autoFocus = false }: Start = {}) {
  const change = vi.fn<(text: string) => void>();
  const submit = vi.fn<() => void>();
  function Harness() {
    const [text, setText] = useState(pending);
    const search: DisputeSearch = {
      pending: text,
      shownId,
      change(next) {
        change(next);
        if (next !== "" && parseDisputeId(next) === null) return;
        setText(next);
      },
      submit,
    };
    return <SearchBox search={search} autoFocus={autoFocus} />;
  }
  const { unmount } = render(<Harness />);
  return { change, submit, unmount, user: userEvent.setup() };
}

/** A `matchMedia` that answers every query with `matches`, as a phone does for a coarse pointer. */
function stubPointer(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

/** A paste reported with no `data` and the text in `dataTransfer`. Returns whether the field let it through. */
function pasteAsTransfer(text: string): boolean {
  const event = new InputEvent("beforeinput", { inputType: "insertFromPaste", data: null, bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { getData: () => text } });
  return fireEvent(field(), event);
}

/**
 * An insertion whose `beforeinput` cannot be cancelled, as a composing keyboard's: the browser puts the text in whatever
 * the field says, then reports the new value.
 */
function insertUncancellable(text: string, inputType = "insertText"): void {
  const input = field();
  const { value } = input;
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? start;
  fireEvent(input, new InputEvent("beforeinput", { inputType, data: text, bubbles: true, cancelable: false }));
  fireEvent.input(input, { target: { value: value.slice(0, start) + text + value.slice(end) } });
}

function form(): HTMLElement {
  return screen.getByRole("search", { name: "Search by dispute ID" });
}

function field(): HTMLInputElement {
  const element = screen.getByRole("searchbox", { name: "Dispute ID" });
  if (!(element instanceof HTMLInputElement)) throw new Error("The dispute ID field is not an input.");
  return element;
}

function expectNoMessage(): void {
  expect(form().textContent).toBe("");
  expect(form().querySelector("[aria-live], [role='alert'], [role='status'], output")).toBeNull();
  expect(field()).not.toHaveAttribute("aria-describedby");
  expect(field()).not.toHaveAttribute("aria-invalid");
  expect(form().querySelector("[data-invalid]")).toBeNull();
  expect(field()).toBeValid();
}

describe("SearchBox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is one search landmark holding one field named Dispute ID, whose placeholder is the only visible prompt", () => {
    renderSearch();
    expect(screen.getAllByRole("search")).toHaveLength(1);
    expect(field()).toHaveAttribute("placeholder", "Dispute ID");
    expect(form().querySelector("label")).toBeNull();
    expect(form().querySelector("a")).toBeNull();
    expect(form().textContent).toBe("");
  });

  it("keeps the placeholder legible in light and dims it in dark, where full strength would pass for a typed ID", () => {
    renderSearch();
    expect(field()).toHaveClass("placeholder:opacity-100", "dark:placeholder:opacity-70");
  });

  it("focuses the field when asked, as the empty lookup page does, except where a finger is the pointer", () => {
    const { unmount } = renderSearch({ autoFocus: true });
    expect(field()).toHaveFocus();
    unmount();

    stubPointer(true);
    renderSearch({ autoFocus: true });
    expect(field()).not.toHaveFocus();
  });

  it("asks phones for the number pad without making the field a number input", () => {
    renderSearch();
    expect(field()).toHaveAttribute("type", "search");
    expect(field()).toHaveAttribute("inputmode", "numeric");
    expect(field()).toHaveAttribute("pattern", "[0-9]*");
    expect(field()).toHaveAttribute("autocomplete", "off");
    expect(field()).toHaveAttribute("spellcheck", "false");
    expect(field()).toHaveAttribute("enterkeyhint", "search");
  });

  it("is centred at the page message's width and fills the row when the row is narrower", () => {
    renderSearch();
    expect(form()).toHaveClass("mx-auto", "w-full", "max-w-xl");
    const root = form().firstElementChild;
    expect(root).toHaveClass("w-full");
    expect(root).not.toHaveClass("w-69.5");
  });

  it("shows the URL's dispute ID, or the text still being typed as it was typed", () => {
    const { unmount } = renderSearch({ shownId: 1650n });
    expect(field()).toHaveValue("1650");
    unmount();
    renderSearch({ pending: "0016", shownId: 16n });
    expect(field()).toHaveValue("0016");
  });

  it("a typed non-digit never enters the field and never reaches the search", async () => {
    const { change, user } = renderSearch();
    await user.type(field(), "a1b2-3 .e");
    expect(field()).toHaveValue("123");
    expect(change.mock.calls).toEqual([["1"], ["12"], ["123"]]);
  });

  it("a refused key in the middle of the ID leaves the caret where it was", async () => {
    const { user } = renderSearch();
    await user.type(field(), "1650");
    await user.keyboard("{ArrowLeft}{ArrowLeft}x7");
    expect(field()).toHaveValue("16750");
  });

  it("a letter typed over selected digits keeps the digits and the selection", async () => {
    const { change, user } = renderSearch();
    await user.type(field(), "1650");
    change.mockClear();
    field().setSelectionRange(1, 3);
    await user.keyboard("x");
    expect(field()).toHaveValue("1650");
    expect(change).not.toHaveBeenCalled();
    expect(field().selectionStart).toBe(1);
    expect(field().selectionEnd).toBe(3);
  });

  it("a paste of an ID wrapped in whitespace into the middle of an ID leaves the caret after the pasted digits", async () => {
    const { change, user } = renderSearch();
    await user.type(field(), "1650");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    await user.paste(" 7\n");
    expect(field()).toHaveValue("16750");
    expect(change).toHaveBeenLastCalledWith("16750");
    expect(field().selectionStart).toBe(3);
    expect(field().selectionEnd).toBe(3);

    await user.keyboard("8");
    expect(field()).toHaveValue("167850");
  });

  it("a paste of an ID wrapped in whitespace over selected digits replaces them and leaves the caret after it", async () => {
    const { user } = renderSearch();
    await user.type(field(), "1650");
    field().setSelectionRange(1, 3);
    await user.paste(" 7 ");
    expect(field()).toHaveValue("170");
    expect(field().selectionStart).toBe(2);
  });

  it("a paste the browser hands over as transferred text is refused or let through like any other", async () => {
    const { user } = renderSearch();
    await user.type(field(), "12");
    expect(pasteAsTransfer("abc")).toBe(false);
    expect(pasteAsTransfer("#3")).toBe(false);
    expect(pasteAsTransfer("3")).toBe(true);
  });

  it("a pasted case link is refused whole rather than read as the chain ID glued to the dispute ID", async () => {
    const { change, user } = renderSearch({ shownId: 1621n });
    await user.click(field());
    field().setSelectionRange(1, 3);
    await user.paste("https://resolve.kleros.io/1/cases/1650");
    expect(field()).toHaveValue("1621");
    expect(field().selectionStart).toBe(1);
    expect(field().selectionEnd).toBe(3);
    expect(change).not.toHaveBeenCalled();
    expectNoMessage();
  });

  it.each(["#1650", "1,650", "16 50", "ID: 16-50", "x7", "abc", "#"])("a paste of %j is refused and leaves the field, its caret and its selection as they were", async (pasted) => {
    const { change, user } = renderSearch({ shownId: 1621n });
    await user.click(field());
    field().setSelectionRange(2, 2);
    await user.paste(pasted);
    expect(field()).toHaveValue("1621");
    expect(field().selectionStart).toBe(2);
    expect(field().selectionEnd).toBe(2);
    expect(change).not.toHaveBeenCalled();

    field().setSelectionRange(1, 3);
    await user.paste(pasted);
    expect(field()).toHaveValue("1621");
    expect(field().selectionStart).toBe(1);
    expect(field().selectionEnd).toBe(3);
    expect(change).not.toHaveBeenCalled();
  });

  it("text that reaches the field without an insertion it could refuse, as a composing keyboard's can, enters only when it is an ID", () => {
    const { change } = renderSearch({ shownId: 1621n });
    fireEvent.change(field(), { target: { value: "1/cases/1621" } });
    expect(field()).toHaveValue("1621");
    expect(change).not.toHaveBeenCalled();

    fireEvent.change(field(), { target: { value: "16217" } });
    expect(field()).toHaveValue("16217");
    expect(change.mock.calls).toEqual([["16217"]]);
  });

  it.each(["16 50", "16\t50", "1 621", "1621 ", " 1621", "\t"])(
    "text %j that reaches the field without an insertion it could refuse is refused, never read as the ID without its whitespace",
    (text) => {
      const { change } = renderSearch({ shownId: 1621n });
      fireEvent.change(field(), { target: { value: text } });
      expect(field()).toHaveValue("1621");
      expect(change).not.toHaveBeenCalled();
    },
  );

  it("an ID wrapped in whitespace that reaches the field without an insertion it could refuse enters as the ID alone", () => {
    const { change } = renderSearch({ shownId: 1621n });
    fireEvent.change(field(), { target: { value: " 1650\t" } });
    expect(field()).toHaveValue("1650");
    expect(change.mock.calls).toEqual([["1650"]]);
  });

  it.each(["1x1", "1 1", " ", "\t", "9".repeat(78)])("an insertion of %j the field could not cancel is undone, keeping the selection it would have replaced", (text) => {
    const { change } = renderSearch({ shownId: 1621n });
    field().setSelectionRange(1, 3);
    insertUncancellable(text);
    expect(field()).toHaveValue("1621");
    expect(field().selectionStart).toBe(1);
    expect(field().selectionEnd).toBe(3);

    field().setSelectionRange(2, 2);
    insertUncancellable(text);
    expect(field()).toHaveValue("1621");
    expect(field().selectionStart).toBe(2);
    expect(field().selectionEnd).toBe(2);
    expect(change).not.toHaveBeenCalled();
  });

  it("a composed character that is not a digit is undone and leaves the caret where the composition started", () => {
    const { change } = renderSearch({ shownId: 1621n });
    field().setSelectionRange(2, 2);
    fireEvent.compositionStart(field(), { data: "" });
    insertUncancellable("x", "insertCompositionText");
    fireEvent.compositionEnd(field(), { data: "x" });
    expect(field()).toHaveValue("1621");
    expect(field().selectionStart).toBe(2);
    expect(field().selectionEnd).toBe(2);
    expect(change).not.toHaveBeenCalled();
  });

  it("an ID wrapped in whitespace that the field could not cancel enters as the ID alone, with the caret after it", () => {
    const { change } = renderSearch({ shownId: 1650n });
    field().setSelectionRange(2, 2);
    insertUncancellable(" 7 ");
    expect(field()).toHaveValue("16750");
    expect(change.mock.calls).toEqual([["16750"]]);
    expect(field().selectionStart).toBe(3);
    expect(field().selectionEnd).toBe(3);
  });

  it("cuts anything longer than the largest dispute ID, 78 digits, to 78", async () => {
    const { change, user } = renderSearch();
    await user.click(field());
    await user.paste(`${LARGEST_ID}123`);
    expect(field()).toHaveValue(LARGEST_ID);
    expect(change.mock.calls).toEqual([[LARGEST_ID]]);

    await user.type(field(), "1");
    expect(field()).toHaveValue(LARGEST_ID);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("refuses a 78-digit number above the largest dispute ID and keeps the caret where it was", async () => {
    const { user } = renderSearch({ shownId: 1650n });
    await user.click(field());
    field().setSelectionRange(2, 2);
    await user.paste("9".repeat(78));
    expect(field()).toHaveValue("1650");
    expect(field().selectionStart).toBe(2);
    expect(field().selectionEnd).toBe(2);

    field().setSelectionRange(1, 3);
    await user.paste("9".repeat(78));
    expect(field()).toHaveValue("1650");
    expect(field().selectionStart).toBe(1);
    expect(field().selectionEnd).toBe(3);
    expectNoMessage();
  });

  it("never shows a message, whatever is typed or pasted", async () => {
    const { user } = renderSearch();
    await user.type(field(), "12");
    const before = form().innerHTML;
    await user.keyboard("a");
    expect(form().innerHTML).toBe(before);
    expectNoMessage();
    await user.paste("#");
    expect(form().innerHTML).toBe(before);
    expectNoMessage();
    await user.paste("x".repeat(100));
    expectNoMessage();
    await user.paste("9".repeat(100));
    expectNoMessage();
  });

  it("Enter submits the search once and changes nothing", async () => {
    const { change, submit, user } = renderSearch({ pending: "16", shownId: 16n });
    await user.type(field(), "{Enter}");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(field()).toHaveValue("16");
  });

  it("Escape clears the field", async () => {
    const { change, user } = renderSearch({ pending: "16", shownId: 16n });
    await user.type(field(), "{Escape}");
    expect(change.mock.calls).toEqual([[""]]);
    expect(field()).toHaveValue("");
  });

  it("shows every digit of a URL ID above 2^53", () => {
    renderSearch({ shownId: 2n ** 53n + 1n });
    expect(field()).toHaveValue("9007199254740993");
  });
});
