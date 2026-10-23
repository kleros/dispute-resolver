import { Searchbar } from "@kleros/ui-components-library";
import { useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { useMediaQuery } from "../../ui";
import type { DisputeSearch } from "./useDisputeSearch";

const MAX_ID_DIGITS = (2n ** 256n - 1n).toString().length;

/** A phone's keyboard would open unasked over the page. */
const COARSE_POINTER_QUERY = "(pointer: coarse)";

function digitsOf(text: string): string {
  return text.replaceAll(/\D/g, "").slice(0, MAX_ID_DIGITS);
}

/** `data` for a text control; `dataTransfer` where an engine reports a paste that way. */
function insertedText(event: InputEvent): string | null {
  return event.data ?? event.dataTransfer?.getData("text/plain") ?? null;
}

/** Where the caret belongs once React has replaced a partly filtered insertion with its digits. */
interface Caret {
  readonly value: string;
  readonly at: number;
}

interface SearchBoxProps {
  readonly search: DisputeSearch;
  /** Focuses the field on mount, except where the pointer is a finger. */
  readonly autoFocus?: boolean;
}

/** Anything but digits is dropped without a word, so the field only ever holds a dispute ID or nothing. */
export function SearchBox({ search, autoFocus = false }: SearchBoxProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const caret = useRef<Caret | null>(null);
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const value = search.pending ?? search.shownId?.toString() ?? "";
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return undefined;
    /**
     * An insertion that filtering would undo whole is cancelled before it reaches the field: let through, it would
     * replace a selection and then be reverted by React, which puts the caret at the end. A partly filtered one goes
     * through and notes where its digits end, so the caret can be put back there after React's replacement.
     */
    const filterInsertion = (event: InputEvent) => {
      const input = event.target;
      const text = insertedText(event);
      // A deletion carries no text (an empty string in some test drivers) and is never filtered.
      if (!(input instanceof HTMLInputElement) || text === null || text === "") return;
      const { value: current, selectionStart, selectionEnd } = input;
      if (selectionStart === null || selectionEnd === null) return;
      const digits = digitsOf(text);
      const next = digitsOf(current.slice(0, selectionStart) + text + current.slice(selectionEnd));
      if (digits === "" || next === current) {
        event.preventDefault();
        return;
      }
      if (digits !== text) caret.current = { value: next, at: digitsOf(current.slice(0, selectionStart) + text).length };
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
  return (
    <form ref={formRef} role="search" aria-label="Search by dispute ID" onSubmit={onSubmit} className="mx-auto w-full max-w-xl">
      <Searchbar
        aria-label="Dispute ID"
        placeholder="Dispute ID"
        autoFocus={autoFocus && !coarsePointer}
        value={value}
        onChange={(text) => {
          const digits = digitsOf(text);
          if (digits !== value) search.change(digits);
        }}
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
