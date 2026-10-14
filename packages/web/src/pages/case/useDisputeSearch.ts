import { parseDisputeId, type ChainId } from "@dispute-resolver/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { paths } from "../../routing";

/** Today's trailing debounce between a change of the search box and the load of the new ID (spec 5.1, 5.2). */
export const SEARCH_DEBOUNCE_MS = 750;

const DIGITS = /^\d*$/;

/** What the search box shows and does (spec 5.2, D-53). */
export interface DisputeSearch {
  /** The typed text still waiting for the debounce, or `null` when the page shows the URL's dispute. */
  readonly pending: string | null;
  /** The ID the field shows: the pending text, else the URL's ID; `null` for an empty field. */
  readonly shownId: bigint | null;
  /** A new text in the field: digits only, anything else is ignored. */
  change(text: string): void;
  /** Loads the pending text at once (Enter). */
  submit(): void;
}

/** What a text loads: its dispute ID as decimal digits, or "" for the case page without an ID (D-09). */
function targetOf(text: string): string {
  return parseDisputeId(text)?.toString() ?? "";
}

/** What the URL shows; an ID that does not parse is its own target, so clearing the field still leaves it. */
function urlTarget(urlId: string | undefined): string {
  if (urlId === undefined) return "";
  return parseDisputeId(urlId)?.toString() ?? `unparsed:${urlId}`;
}

/**
 * The search box's state (spec 5.2): every change clears the shown dispute at once (D-53) and, after today's 750 ms
 * debounce, replaces the URL with the case page of the typed ID, or with the case page without an ID when the field
 * is empty (D-09). The target is built only from a parsed ID (A19). Typing the ID already shown changes nothing, and
 * any change of the URL (the search itself, back, a header link) ends the pending search.
 */
export function useDisputeSearch(chainId: ChainId, urlId: string | undefined): DisputeSearch {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [searchedUrlId, setSearchedUrlId] = useState(urlId);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL moved: what was typed for the previous one no longer applies. Reset during render, so the page never
  // shows the new URL with the old search.
  let active = pending;
  if (searchedUrlId !== urlId) {
    setSearchedUrlId(urlId);
    setPending(null);
    active = null;
  }

  // A navigation, or leaving the page, drops the debounce that was waiting.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [urlId],
  );

  const load = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      const id = parseDisputeId(text);
      void navigate(id === null ? paths.cases(chainId) : paths.case(chainId, id), { replace: true });
    },
    [chainId, navigate],
  );

  const change = useCallback(
    (text: string) => {
      if (!DIGITS.test(text)) return;
      if (active !== null && targetOf(active) === targetOf(text)) return;
      clearTimeout(timer.current);
      if (targetOf(text) === urlTarget(urlId)) {
        setPending(null);
        return;
      }
      setPending(text);
      timer.current = setTimeout(() => {
        load(text);
      }, SEARCH_DEBOUNCE_MS);
    },
    [active, load, urlId],
  );

  const submit = useCallback(() => {
    if (active !== null) load(active);
  }, [active, load]);

  const shown = active ?? urlId;
  return { pending: active, shownId: shown === undefined ? null : parseDisputeId(shown), change, submit };
}
