import { parseDisputeId } from "@dispute-resolver/core";
import { Searchbar } from "@kleros/ui-components-library";
import { useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { useMediaQuery } from "../../ui";
import type { DisputeSearch } from "./useDisputeSearch";

const MAX_ID_DIGITS = (2n ** 256n - 1n).toString().length;

/** A phone's keyboard would open unasked over the page. */
const COARSE_POINTER_QUERY = "(pointer: coarse)";

/** Only an ID enters: anything else (a case link, "#1650", "1,650", "16 50") is refused whole, never mined for its digits. */
const ID_TEXT = /^\d+$/;

/** `data` for a text control; `dataTransfer` where an engine reports a paste that way. */
function insertedText(event: InputEvent): string | null {
  return event.data ?? event.dataTransfer?.getData("text/plain") ?? null;
}

/**
 * The field's text as the ID it holds, or `null` when it holds anything else. Whitespace counts only around an ID: the
 * field never holds any, so whitespace alone was inserted, not left by clearing it. A number the search would refuse
 * (78 digits above the largest ID) is refused here, where the caret and selection can still be kept.
 */
function idOf(text: string): string | null {
  if (text === "") return "";
  const id = text.trim();
  if (!ID_TEXT.test(id)) return null;
  const capped = id.slice(0, MAX_ID_DIGITS);
  return parseDisputeId(capped) === null ? null : capped;
}

/** Where the caret belongs once React has replaced an insertion with its digits, without its whitespace or past the cap. */
interface Caret {
  readonly value: string;
  readonly at: number;
}

/**
 * The field and its selection just before an insertion, kept for the one that `beforeinput` could not cancel (a
 * composing keyboard's): refused, it is undone with that selection.
 */
interface Insertion {
  readonly value: string;
  readonly start: number;
  readonly end: number;
  /** Set when the insertion is accepted but React still rewrites it. */
  readonly rewrite: Caret | null;
}

interface SearchBoxProps {
  readonly search: DisputeSearch;
  /** Focuses the field on mount, except where the pointer is a finger. */
  readonly autoFocus?: boolean;
}

/** Anything that is not an ID is refused without a word, so the field only ever holds a dispute ID or nothing. */
export function SearchBox({ search, autoFocus = false }: SearchBoxProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const insertion = useRef<Insertion | null>(null);
  const caret = useRef<Caret | null>(null);
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const value = search.pending ?? search.shownId?.toString() ?? "";
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return undefined;
    /**
     * A refused insertion is cancelled before it reaches the field: let through, it would replace a selection and then
     * be reverted by React, which puts the caret at the end. An accepted one that React will still change (whitespace
     * around its digits, digits past the cap) goes through and notes where its digits end, so the caret can be put back
     * there after React's replacement.
     */
    const filterInsertion = (event: InputEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const { value: current, selectionStart, selectionEnd } = input;
      if (selectionStart === null || selectionEnd === null) return;
      insertion.current = { value: current, start: selectionStart, end: selectionEnd, rewrite: null };
      const text = insertedText(event);
      // A deletion carries no text (an empty string in some test drivers) and is never filtered.
      if (text === null || text === "") return;
      const id = text.trim();
      const before = current.slice(0, selectionStart);
      const after = current.slice(selectionEnd);
      const next = (before + id + after).slice(0, MAX_ID_DIGITS);
      if (!ID_TEXT.test(id) || next === current || parseDisputeId(next) === null) {
        event.preventDefault();
        return;
      }
      if (next !== before + text + after) {
        const rewrite = { value: next, at: Math.min(before.length + id.length, MAX_ID_DIGITS) };
        insertion.current = { ...insertion.current, rewrite };
      }
    };
    form.addEventListener("beforeinput", filterInsertion);
    return () => {
      form.removeEventListener("beforeinput", filterInsertion);
    };
  }, []);
  useLayoutEffect(() => {
    const pending = caret.current;
    caret.current = null;
    const input = formRef.current?.querySelector("input");
    if (pending === null || input?.value !== pending.value) return;
    input.setSelectionRange(pending.at, pending.at);
  }, [value]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search.submit();
  };
  const onChange = (text: string) => {
    const noted = insertion.current;
    insertion.current = null;
    const rewrite = noted?.rewrite ?? null;
    // Only the insertion `beforeinput` accepted may lose whitespace from inside the text: the browser put it between digits.
    const accepted = rewrite !== null && text.replaceAll(/\s/g, "").slice(0, MAX_ID_DIGITS) === rewrite.value;
    const next = accepted ? rewrite.value : idOf(text);
    if (next !== null && next !== value) {
      if (accepted) caret.current = rewrite;
      search.change(next);
      return;
    }
    const input = formRef.current?.querySelector("input");
    if (noted?.value !== value || !input) return;
    // React would put the value back only after this handler, with the caret at the end; once it is back, React leaves it.
    input.value = value;
    input.setSelectionRange(noted.start, noted.end);
  };
  return (
    <form ref={formRef} role="search" aria-label="Search by dispute ID" onSubmit={onSubmit} className="mx-auto w-full max-w-xl">
      <Searchbar
        aria-label="Dispute ID"
        placeholder="Dispute ID"
        autoFocus={autoFocus && !coarsePointer}
        value={value}
        onChange={onChange}
        className="w-full"
        inputProps={{
          inputMode: "numeric",
          pattern: "[0-9]*",
          autoComplete: "off",
          spellCheck: false,
          enterKeyHint: "search",
          className: "placeholder:opacity-100 dark:placeholder:opacity-70",
        }}
      />
    </form>
  );
}
