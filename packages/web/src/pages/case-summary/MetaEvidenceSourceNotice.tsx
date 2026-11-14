import { Notice } from "../../ui";
import type { CaseSectionProps } from "../../data";

const TITLE_DIFFERENT_FILE = "The meta-evidence API pointed to a different file than the one recorded on-chain";
const TITLE_UNVERIFIABLE = "The meta-evidence API pointed to a file that cannot be verified";
const BODY_DIFFERENT_FILE =
  "This page shows the meta-evidence file the arbitrable contract recorded on-chain. Other interfaces may show the other file's details, and the Ongoing Disputes list may show its title.";
const BODY_UNVERIFIABLE = "This page shows the meta-evidence file the arbitrable contract recorded on-chain. Other interfaces may show different details for this dispute.";

/**
 * The file the meta-evidence API answered is untrusted and is never shown, printed or linked. The polite status region
 * is always mounted, empty and boxless, so the warning is announced as an addition to it. The copy names no field of
 * this page: a dynamic script or a Reality proxy may set the title or the question after the source is chosen. The
 * Ongoing Disputes list reads the API first, so it may show the other file's title.
 */
export function MetaEvidenceSourceNotice({ dispute }: CaseSectionProps) {
  const { metaEvidence } = dispute;
  const source = metaEvidence.status === "ready" && metaEvidence.value.status === "ok" ? metaEvidence.value.source : null;
  const disagrees = source?.kind === "event" && source.locator === "disagrees";
  const unverifiable = disagrees && source.locatorPath === null;
  return (
    <output className="contents">
      {disagrees ? (
        <Notice variant="warning" title={unverifiable ? TITLE_UNVERIFIABLE : TITLE_DIFFERENT_FILE} body={unverifiable ? BODY_UNVERIFIABLE : BODY_DIFFERENT_FILE} />
      ) : null}
    </output>
  );
}
