import { Notice } from "../../ui";
import type { CaseSectionProps } from "../../data";

const TITLE_DIFFERENT_FILE = "The meta-evidence API pointed to a different file than the one recorded on-chain";
const TITLE_UNVERIFIABLE = "The meta-evidence API pointed to a file that cannot be verified";
const BODY_DIFFERENT_FILE =
  "This page shows the meta-evidence file the arbitrable contract recorded on-chain. Other interfaces may show the other file's details, and the Ongoing Disputes list may show its title.";
const BODY_UNVERIFIABLE =
  "This page shows the meta-evidence file the arbitrable contract recorded on-chain. Other interfaces may show different details for this dispute.";

/**
 * The meta-evidence source warning (P-25): the shown meta-evidence came from the arbitrable's `MetaEvidence` event and
 * the meta-evidence API answered another file, or an answer that is not content-addressed; neither is shown, printed or
 * linked. An incomplete or absent comparison stays silent, as does a result the API decided or one that was rejected.
 * The polite status region is always mounted, empty and boxless (`display: contents`) until a disagreement, so the
 * warning is announced as an addition to it, as the toast region does. The title and body are chosen together on whether
 * the API's answer was content-addressed. The copy names no field of this page: a dynamic script or a Reality proxy may
 * set the title or the question after the source is chosen. The Ongoing Disputes list reads the API first (D-37), so
 * it may show the other file's title.
 */
export function MetaEvidenceSourceNotice({ dispute }: CaseSectionProps) {
  const { metaEvidence } = dispute;
  const source = metaEvidence.status === "ready" && metaEvidence.value.status === "ok" ? metaEvidence.value.source : null;
  const disagrees = source?.kind === "event" && source.locator === "disagrees";
  const unverifiable = disagrees && source.locatorPath === null;
  return (
    <div role="status" className="contents">
      {disagrees ? (
        <Notice
          variant="warning"
          title={unverifiable ? TITLE_UNVERIFIABLE : TITLE_DIFFERENT_FILE}
          body={unverifiable ? BODY_UNVERIFIABLE : BODY_DIFFERENT_FILE}
        />
      ) : null}
    </div>
  );
}
