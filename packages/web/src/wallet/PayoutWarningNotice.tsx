import { ExternalLink } from "../safe-content";
import { Notice } from "../ui";
import { SMART_ACCOUNT_FAQ_URL } from "./smartAccountFaq";

const BODY =
  "Refunds and rewards may not reach this account because of its smart-wallet code. Regular accounts receive them. If your wallet can switch this account back to a regular account, do that before you withdraw.";

/** Not dismissible, so it is there each time money goes in or comes out. */
export function PayoutWarningNotice() {
  return (
    <section aria-label="Payout warning" className="flex flex-col items-start gap-2">
      <Notice variant="warning" title="Warning" body={BODY} />
      <ExternalLink href={SMART_ACCOUNT_FAQ_URL}>Learn more</ExternalLink>
    </section>
  );
}
