import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** Holds the typed text the way the page's search does, so typed keys build on each other. */
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

  it("leaves focus alone when not asked, as a case page does", () => {
    renderSearch({ shownId: 1650n });
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

  it("a paste of mixed text into the middle of an ID leaves the caret after the digits it kept", async () => {
    const { change, user } = renderSearch();
    await user.type(field(), "1650");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    await user.paste("x7");
    expect(field()).toHaveValue("16750");
    expect(change).toHaveBeenLastCalledWith("16750");
    expect(field().selectionStart).toBe(3);
    expect(field().selectionEnd).toBe(3);

    await user.keyboard("8");
    expect(field()).toHaveValue("167850");
  });

  it("a paste of mixed text over selected digits replaces them with its digits and leaves the caret after them", async () => {
    const { user } = renderSearch();
    await user.type(field(), "1650");
    field().setSelectionRange(1, 3);
    await user.paste("#7#");
    expect(field()).toHaveValue("170");
    expect(field().selectionStart).toBe(2);
  });

  it("a paste the browser hands over as transferred text is filtered like any other", async () => {
    const { user } = renderSearch();
    await user.type(field(), "12");
    expect(pasteAsTransfer("abc")).toBe(false);
    expect(pasteAsTransfer("3")).toBe(true);
  });

  it.each([
    ["#1650", "1650"],
    ["1,650", "1650"],
    [" 1650\n", "1650"],
    ["ID: 16-50", "1650"],
  ])("a paste of %j keeps only its digits", async (pasted, digits) => {
    const { change, user } = renderSearch();
    await user.click(field());
    await user.paste(pasted);
    expect(field()).toHaveValue(digits);
    expect(change.mock.calls).toEqual([[digits]]);
  });

  it("a paste with no digits leaves the field as it was", async () => {
    const { change, user } = renderSearch({ shownId: 12n });
    await user.click(field());
    await user.paste("abc");
    expect(field()).toHaveValue("12");
    expect(change).not.toHaveBeenCalled();
  });

  it("cuts anything longer than the largest dispute ID, 78 digits, to 78", async () => {
    const { change, user } = renderSearch();
    await user.click(field());
    await user.paste(`#${LARGEST_ID}123`);
    expect(field()).toHaveValue(LARGEST_ID);
    expect(change.mock.calls).toEqual([[LARGEST_ID]]);

    await user.type(field(), "1");
    expect(field()).toHaveValue(LARGEST_ID);
    expect(change).toHaveBeenCalledTimes(1);
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

  it("keeps every digit of IDs above 2^53, shown or pasted", async () => {
    const { unmount } = renderSearch({ shownId: 2n ** 53n + 1n });
    expect(field()).toHaveValue("9007199254740993");
    unmount();

    const { change, user } = renderSearch();
    await user.click(field());
    await user.paste(LARGEST_ID);
    expect(field()).toHaveValue(LARGEST_ID);
    expect(change.mock.calls).toEqual([[LARGEST_ID]]);
  });
});
