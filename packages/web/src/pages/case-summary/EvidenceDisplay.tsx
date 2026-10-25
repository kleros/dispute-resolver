import type { ChainId, MetaEvidence } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { APP_CONFIG } from "../../env";
import { buildEvidenceDisplay, EvidenceDisplayFrame } from "../../safe-content";
import { useCoreDeps } from "../../data";
import { ExpandIndicator, LABEL, readMotionMs, SectionSkeleton } from "../../ui";
import type { FoundLookup } from "./caseState";

interface EvidenceDisplayProps {
  readonly metaEvidence: MetaEvidence;
  /** The page chain, the arbitrator's chain. */
  readonly chainId: ChainId;
  readonly found: FoundLookup;
}

/**
 * How long the page may take to load before the skeleton shows and the status says it is loading, so a page that loads
 * at once gets neither signal. A timer rather than an animation delay, so the hold stays under reduced motion and a load
 * during the fade-in fades the skeleton out from where it is. A live region announces only what changes after it is in
 * the tree, so it mounts empty; this is longer than the gap react-aria's own announcer leaves before writing into it.
 */
const COVER_DELAY_MS = 200;

/** Twelve lines and the 16 px above and below them fill the frame's 360 px. */
const SKELETON_LINES = 12;

/**
 * The library button as a full-width row: its icon slot comes before its text, so the row is reversed to put the title
 * first. The negative margins widen the hover plate past the text column while the title stays flush with the text
 * above; the plate is 44 px under the wrapper's 4 px top padding, so it stands clear of the hairline above and, with
 * the window's 4 px margin, of the display below. The button's own transition tweens its press scale only, and the row
 * has none, so the hover fill eases on the app's hover clock like the section headers below (`ease-smooth-out`, not the
 * arbitrary ease: the button's `ease-ease` stays in the class list and outranks that one). `dr-display-row` draws its
 * focus ring on the plate's edge, inside those two 4 px gaps, where neither the hairline nor the window covers it.
 */
const ROW_CLASS =
  "dr-display-row -mx-2 h-11 w-[calc(100%+1rem)] flex-row-reverse justify-between gap-2 bg-transparent px-2 py-0 hover:bg-klerosUIComponentsMediumBlue pressed:scale-100 transition-[background-color] duration-150 ease-smooth-out motion-reduce:transition-none [&_.button-text]:text-klerosUIComponentsPrimaryText";

/**
 * `unfolded` is the open state reached by showing a hidden region, the only one that plays the unfold keyframe: never the
 * first render, and never a press during the fold, where the transition reverses from where it is instead.
 */
type Fold = "open" | "unfolded" | "closing" | "closed";

/** Used when `--acc-collapse` cannot be read; the region is hidden once the fold has run this long. */
const COLLAPSE_FALLBACK_MS = 250;

/**
 * The case sections' fold, on their clocks: the grid track tweens between 1fr and 0fr, so the frame keeps its 360 px.
 * Unlike the sections there is no blur, because the region holds another site's page.
 */
const FOLD_CLASS =
  "grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-(--acc-expand) ease-(--acc-ease) data-[open=false]:grid-rows-[0fr] data-[open=false]:opacity-0 data-[open=false]:duration-(--acc-collapse) motion-reduce:transition-none";

/** A hidden region has no style to transition from, so showing it again needs a keyframe. */
const UNFOLD_CLASS = "animate-[t-acc-unfold_var(--acc-expand)_var(--acc-ease)_backwards] motion-reduce:animate-none";

/**
 * The block's hairline, with 4 px under it before the row. While the display is hidden it pulls the card's bottom padding
 * in by the room under the row's label, so the label sits about as far above the card's foot as any other last item.
 */
const BLOCK_CLASS = "border-t border-klerosUIComponentsStroke pt-1 transition-[margin] ease-(--acc-ease) motion-reduce:transition-none";

/** Used when `--display-reveal` cannot be read; the skeleton leaves the tree once its fade-out has run. */
const REVEAL_FALLBACK_MS = 400;

/**
 * The skeleton over the frame's place, on the paper, so its bars take the paper's tone rather than the card's. Inset on
 * every side like a page's own content, so its bars never touch the sheet's edge. It fades in and out by opacity alone, so
 * the region stays free of blur. Only the skeleton fades: the frame is
 * visible under it from the load event, so the page's content is never dimmed, and the pointer passes through from then
 * on, so the first click reaches the page.
 */
const COVER_CLASS =
  "absolute inset-0 p-4 [&_.animate-loading]:bg-(--dr-display-skeleton) transition-opacity duration-(--display-reveal) ease-(--reveal-ease) motion-reduce:transition-none";

/**
 * Whether keyboard focus is inside the region's frame. An iframe never matches :focus while its page holds focus and
 * fires no focus event in this document, so keyboard focus is found as this document's active element after each Tab;
 * any focus that comes back to this document clears it. A pointer click into the page is not keyboard focus and leaves
 * it false. Only this document's active element is read, never the frame's source or window.
 */
function useKeyboardFocusInside(regionRef: RefObject<HTMLElement | null>): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    let pending: number | undefined;
    const check = () => {
      const active = document.activeElement;
      setInside(active instanceof HTMLIFrameElement && regionRef.current?.contains(active) === true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      window.clearTimeout(pending);
      pending = window.setTimeout(check, 0);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(pending);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", check);
      window.removeEventListener("focus", check);
    };
  }, [regionRef]);
  return inside;
}

/**
 * The meta-evidence's evidence-display iframe, or nothing when it names no https display. The arbitrable and the
 * arbitrator come from the arbitrator's binding, never from meta-evidence.
 *
 * Shown, the whole 360 px frame; the row folds it away completely, like the case page's sections. A folding region is
 * inert, so Tab never enters it, and is hidden once the fold ends. A hidden display stays mounted, so showing it again
 * neither requests the page again nor loses its scroll position. The paper is under the frame from the first paint;
 * until the page loads the frame keeps its size unseen, so it can be neither focused nor clicked, and a load that takes
 * longer than a moment shows the section skeleton over its place.
 */
export function EvidenceDisplay({ metaEvidence, chainId, found }: EvidenceDisplayProps) {
  const { env, gateway } = useCoreDeps();
  const rowId = useId();
  const regionId = useId();
  const ownerId = useId();
  const [fold, setFold] = useState<Fold>("open");
  const shown = fold === "open" || fold === "unfolded";
  const [loaded, setLoaded] = useState(false);
  const [covered, setCovered] = useState(true);
  useEffect(() => {
    if (!loaded) return undefined;
    const id = window.setTimeout(
      () => {
        setCovered(false);
      },
      readMotionMs("--display-reveal", REVEAL_FALLBACK_MS),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [loaded]);
  const regionRef = useRef<HTMLDivElement>(null);
  const focusInside = useKeyboardFocusInside(regionRef);
  // Before paint, so no keystroke lands in a closing frame. React 18 has no `inert` prop.
  useLayoutEffect(() => {
    regionRef.current?.toggleAttribute("inert", !shown);
  }, [shown]);
  // A timer, not transitionend: under reduced motion the region has no transition to end.
  useEffect(() => {
    if (fold !== "closing") return undefined;
    const id = window.setTimeout(
      () => {
        setFold("closed");
      },
      readMotionMs("--acc-collapse", COLLAPSE_FALLBACK_MS),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [fold]);
  const [status, setStatus] = useState("");
  const [coverIn, setCoverIn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setStatus("Loading…");
      setCoverIn(true);
    }, COVER_DELAY_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, []);
  const { binding } = found;
  const model = buildEvidenceDisplay({
    metaEvidence,
    arbitratorChainId: chainId,
    disputeId: binding.disputeId,
    arbitrable: binding.arbitrated,
    arbitrator: binding.arbitrator,
    env,
    gateway,
    appOrigin: APP_CONFIG.appOrigin,
  });
  if (model === null) return null;
  const coverOpacity = coverIn ? "opacity-100" : "opacity-0";
  const toggle = () => {
    if (!shown) {
      setFold(fold === "closed" ? "unfolded" : "open");
      return;
    }
    const active = document.activeElement;
    // A screen reader can press the row while focus stays in the frame, which hiding would strand. Firefox refuses to
    // move focus out of a cross-origin frame with focus() alone, so the frame is blurred first.
    if (active instanceof HTMLElement && regionRef.current?.contains(active) === true) {
      active.blur();
      document.getElementById(rowId)?.focus();
    }
    setFold("closing");
  };
  return (
    <div className={shown ? `${BLOCK_CLASS} duration-(--acc-expand)` : `${BLOCK_CLASS} -mb-3 duration-(--acc-collapse)`}>
      <Button
        id={rowId}
        text="Evidence display"
        aria-label="Evidence display"
        aria-describedby={ownerId}
        aria-expanded={shown}
        aria-controls={regionId}
        onPress={toggle}
        className={ROW_CLASS}
        icon={
          <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
            <span className={`${LABEL} flex min-w-0 items-center gap-2`}>
              <span aria-hidden="true" className="max-sm:hidden">
                ·
              </span>
              <span id={ownerId} className="truncate max-sm:sr-only">
                Shown by the arbitrable application
              </span>
            </span>
            <ExpandIndicator expanded={shown} />
          </span>
        }
      />
      <div id={regionId} ref={regionRef} hidden={fold === "closed"} data-open={shown} className={fold === "unfolded" ? `${FOLD_CLASS} ${UNFOLD_CLASS}` : FOLD_CLASS}>
        {/* The one grid item: as a scroll container its minimum height is zero, so the 0fr track folds it away. */}
        <div className="overflow-hidden">
          {/* Outside the busy window, which would hold back its announcements. */}
          {loaded ? null : (
            <output aria-live="polite" className="sr-only">
              {status}
            </output>
          )}
          <div
            data-frame-focus={focusInside ? "" : undefined}
            aria-busy={loaded ? undefined : true}
            className="dr-display-window relative mt-1 overflow-clip rounded-base bg-(--dr-display-paper)"
          >
            <div className={loaded ? undefined : "invisible"}>
              <EvidenceDisplayFrame
                model={model}
                onLoad={() => {
                  setLoaded(true);
                }}
              />
            </div>
            {/* The skeleton's own status would mount already filled, so it goes unannounced; the output above speaks instead. */}
            {covered ? (
              <div aria-hidden="true" className={loaded ? `${COVER_CLASS} pointer-events-none opacity-0` : `${COVER_CLASS} ${coverOpacity}`}>
                <SectionSkeleton variant="text" lines={SKELETON_LINES} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
