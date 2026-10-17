import { parseDisputeId, type ChainId } from "@dispute-resolver/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { paths } from "../../routing";

/** Today's trailing debounce between a change of the search box and the load of the new ID (spec 5.1, 5.2). */
export const SEARCH_DEBOUNCE_MS = 750;

/** What the search box shows and does (spec 5.2, D-53). */
export interface DisputeSearch {
  /** The typed text still waiting for the debounce, or `null` when the page shows the URL's dispute. */
  readonly pending: string | null;
  /** The ID the field shows: the pending text, else the URL's ID; `null` for an empty field. */
  readonly shownId: bigint | null;
  /** A new text in the field: an empty field or a dispute ID, anything else is ignored. */
  change(text: string): void;
  /** Loads the pending ID at once (Enter, P-19). */
  submit(): void;
}

/**
 * A typed text and the URL IDs it applies to: the one it was typed on and the one it wrote, the same when it left the
 * URL as it was. The router commits the URL in a transition, after the text, so the search holds on both.
 */
interface Search {
  readonly text: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
}

/** What a text loads: its dispute ID as decimal digits, or "" for an empty field. */
function targetOf(text: string): string {
  return parseDisputeId(text)?.toString() ?? "";
}

/** What the URL shows; an ID that does not parse is its own target, so clearing the field still leaves it. */
function urlTarget(urlId: string | undefined): string {
  if (urlId === undefined) return "";
  return parseDisputeId(urlId)?.toString() ?? `unparsed:${urlId}`;
}

/**
 * The search box's state (spec 1.4, 5.2): every change clears the shown dispute at once (D-53) and replaces the URL
 * at once with the case page of the typed ID, built only from the parsed ID (A19); only the load of that ID waits for
 * today's 750 ms debounce, or for Enter (P-19). An empty field shows no dispute and, as today's `<Redirect>` guard,
 * leaves the URL as it is. Typing the ID already shown changes nothing, and a change of the URL the search did not
 * make (back, a header link) ends the pending search.
 */
export function useDisputeSearch(chainId: ChainId, urlId: string | undefined): DisputeSearch {
  const navigate = useNavigate();
  const [search, setSearch] = useState<Search | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = search !== null && (urlId === search.from || urlId === search.to) ? search.text : null;

  // Leaving the page drops the debounce that was waiting.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    setSearch(null);
  }, []);

  const change = useCallback(
    (text: string) => {
      const id = parseDisputeId(text);
      if (text !== "" && id === null) return;
      if (active !== null && targetOf(active) === targetOf(text)) return;
      clearTimeout(timer.current);
      if (targetOf(text) === urlTarget(urlId)) {
        setSearch(null);
        return;
      }
      if (id === null) {
        setSearch({ text, from: urlId, to: urlId });
        return;
      }
      setSearch({ text, from: urlId, to: id.toString() });
      void navigate(paths.case(chainId, id), { replace: true });
      timer.current = setTimeout(settle, SEARCH_DEBOUNCE_MS);
    },
    [active, chainId, navigate, settle, urlId],
  );

  const submit = useCallback(() => {
    if (active !== null && active !== "") settle();
  }, [active, settle]);

  const shown = active ?? urlId;
  return { pending: active, shownId: shown === undefined ? null : parseDisputeId(shown), change, submit };
}
