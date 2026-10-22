import { Notice } from "../../ui";

const BODY =
  "The arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund appeals on this interface. You can do these on the arbitrable application, if implemented.";

export function CompatibilityBanner() {
  return <Notice variant="info" title="View mode only for this dispute" body={BODY} />;
}
