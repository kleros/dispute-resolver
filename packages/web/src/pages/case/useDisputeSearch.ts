import { parseDisputeId } from "@dispute-resolver/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { paths } from "../../routing";

export const SEARCH_DEBOUNCE_MS = 750;

export interface DisputeSearch {
  readonly pending: string | null;
  readonly shownId: bigint | null;
  change(text: string): void;
  submit(): void;
}

/** A navigation the search still owes, made once by an effect; the object's identity tells one already made. */
type Step = { readonly kind: "back" } | { readonly kind: "push"; readonly id: bigint };

/** The router commits the URL in a transition, after the text, so the search holds on both the old and the new URL ID. */
interface Search {
  readonly text: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
  /** Whether the search has added its history entry; a clear changes no URL, so it adds none. */
  readonly navigated: boolean;
  /** The URL ID the search started from; `from` cannot tell, it moves to `to` once the search's navigation lands. */
  readonly start: string | undefined;
  /**
   * Set while history goes back over the search's entry, with `from` the entry's ID and `to` the start: `"to-entry"`
   * until the navigation to that entry lands, then `"returning"` until the URL is back on the start. History goes back
   * only once the entry is shown, so the hook sees both navigations land and never needs a timeout to guess. Until the
   * return the start stays shown, so the ID being left is never loaded, and an edit only waits to be applied from it.
   */
  readonly back: "to-entry" | "returning" | null;
  readonly step: Step | null;
}

function targetOf(text: string): string {
  return parseDisputeId(text)?.toString() ?? "";
}

/** An ID that does not parse is its own target, so clearing the field still leaves it. */
function urlTarget(urlId: string | undefined): string {
  if (urlId === undefined) return "";
  return parseDisputeId(urlId)?.toString() ?? `unparsed:${urlId}`;
}

/** The URL ID the URL ends on once the search's navigations land; one not yet gone back over is still that. */
function landingOf(search: Search | null, urlId: string | undefined): string | undefined {
  if (search === null) return urlId;
  return search.back === "to-entry" ? search.from : search.to;
}

/** Back on its start, the search applies what was typed meanwhile: nothing left to do, a clear, or a new lookup. */
function afterReturn({ text, start }: Search): Search | null {
  if (targetOf(text) === urlTarget(start)) return null;
  const id = parseDisputeId(text);
  if (id === null) return { text, from: start, to: start, navigated: false, start, back: null, step: null };
  return { text, from: start, to: id.toString(), navigated: true, start, back: null, step: { kind: "push", id } };
}

/**
 * The search once the URL is on `urlId`. The URL a search left holds it only until the search's own navigation lands:
 * Back to it afterwards ends the search. An ended search is dropped, not kept aside: Forward back to its URL would
 * otherwise revive it.
 */
function reconcile(search: Search, urlId: string | undefined): Search | null {
  if (urlId !== search.from && urlId !== search.to) return null;
  if (search.back === "to-entry") return urlId === search.from ? { ...search, back: "returning", step: { kind: "back" } } : search;
  if (search.back === "returning") return urlId === search.to ? afterReturn(search) : search;
  return urlId === search.to && search.from !== search.to ? { ...search, from: search.to } : search;
}

/**
 * Every change sets the URL at once, built only from the parsed ID; only the load of that ID waits for the debounce or
 * for Enter, which settle the search. A search's first URL gets a new history entry and its later ones replace it, so
 * Back returns to the dispute it left. A change back to the dispute the search started from, before it settled, goes
 * back over that entry instead and ends the search, leaving history as it was before it; once the search settled, that
 * change is a new search with its own entry. An empty field shows no dispute and leaves the URL as it is. A change of
 * the URL the search did not make (back, a header link) ends the pending search.
 */
export function useDisputeSearch(chainId: number, urlId: string | undefined): DisputeSearch {
  const navigate = useNavigate();
  const [search, setSearch] = useState<Search | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const made = useRef<Step | null>(null);
  const current = search === null ? null : reconcile(search, urlId);
  if (current !== search) setSearch(current);
  const active = current?.text ?? null;

  useEffect(() => {
    if (search === null) clearTimeout(timer.current);
  }, [search]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback(() => {
    setSearch(null);
  }, []);

  useEffect(() => {
    const step = search?.step ?? null;
    if (step === null || step === made.current) return;
    made.current = step;
    if (step.kind === "back") {
      void navigate(-1);
      return;
    }
    void navigate(paths.case(chainId, step.id));
    timer.current = setTimeout(settle, SEARCH_DEBOUNCE_MS);
  }, [chainId, navigate, search, settle]);

  const change = useCallback(
    (text: string) => {
      const id = parseDisputeId(text);
      if (text !== "" && id === null) return;
      if (active !== null && targetOf(active) === targetOf(text)) return;
      clearTimeout(timer.current);
      // A navigation made now would race the step back: the browser takes that step from wherever history is by then.
      if (current?.back === "returning") {
        setSearch({ ...current, text });
        return;
      }
      // Until the active search's navigation lands, `urlId` is the URL being left; the URL ends on that search's target.
      const landing = landingOf(current, urlId);
      const navigated = current?.navigated ?? false;
      const start = current === null ? urlId : current.start;
      if (landing === urlId && targetOf(text) === urlTarget(urlId)) {
        setSearch(null);
        return;
      }
      if (id === null) {
        setSearch({ text, from: urlId, to: landing, navigated, start, back: null, step: null });
        return;
      }
      if (navigated && id.toString() === urlTarget(start)) {
        const onEntry = landing === urlId;
        setSearch({ text, from: landing, to: start, navigated, start, back: onEntry ? "returning" : "to-entry", step: onEntry ? { kind: "back" } : null });
        return;
      }
      setSearch({ text, from: urlId, to: id.toString(), navigated: true, start, back: null, step: null });
      void navigate(paths.case(chainId, id), { replace: navigated });
      timer.current = setTimeout(settle, SEARCH_DEBOUNCE_MS);
    },
    [active, chainId, current, navigate, settle, urlId],
  );

  const submit = useCallback(() => {
    if (active !== null && active !== "" && current?.back === null) settle();
  }, [active, current, settle]);

  const shown = active ?? urlId;
  return { pending: active, shownId: shown === undefined ? null : parseDisputeId(shown), change, submit };
}
