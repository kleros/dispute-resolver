import type { ComponentType } from "react";
import { ExternalLink } from "../safe-content";
import { ExplorerIcon, ForumIcon, GitHubIcon, HelpIcon, LinkedInIcon, RedditIcon, SlackIcon, TelegramIcon, TwitterIcon } from "./icons";
import { BAR_FOCUS, BAR_SURFACE, CONTENT, GUTTER } from "./layout";
import securedByKlerosUrl from "./secured-by-kleros.svg";

/** The chain's explorer page of its ArbitrableProxy (spec §2.4, D-40). */
export interface FooterExplorerLink {
  readonly href: string;
  readonly chainName: string;
}

export interface FooterProps {
  /** The resolved chain's name, "Unsupported Network" on that screen, or `null` when no chain is known (root failure). */
  readonly chainLabel: string | null;
  readonly explorer: FooterExplorerLink | null;
}

interface SocialLink {
  readonly name: string;
  readonly href: string;
  readonly Icon: ComponentType<{ readonly className?: string }>;
}

/** spec §2.4, in today's order. */
const SOCIAL_LINKS: readonly SocialLink[] = [
  { name: "GitHub", href: "https://github.com/kleros/dispute-resolver", Icon: GitHubIcon },
  { name: "Slack", href: "https://slack.kleros.io", Icon: SlackIcon },
  { name: "Reddit", href: "https://reddit.com/r/Kleros/", Icon: RedditIcon },
  { name: "Twitter", href: "https://twitter.com/kleros_io", Icon: TwitterIcon },
  { name: "Kleros Forum", href: "https://forum.kleros.io", Icon: ForumIcon },
  { name: "Telegram", href: "https://t.me/kleros", Icon: TelegramIcon },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/kleros/", Icon: LinkedInIcon },
];

const ICON_LINK = `inline-flex size-9 items-center justify-center opacity-90 transition-opacity hover:opacity-100 ${BAR_FOCUS}`;

/**
 * The footer (spec §2.4): Secured by Kleros, the resolved chain, I need help, the chain's explorer link to its
 * ArbitrableProxy when the chain has both (D-40), and the social channels. Every link is an `ExternalLink` (A10).
 */
export function Footer({ chainLabel, explorer }: FooterProps) {
  return (
    <footer className={`${BAR_SURFACE} ${GUTTER}`}>
      <div className={`${CONTENT} flex flex-col items-center gap-4 py-6 text-sm sm:flex-row sm:flex-wrap sm:justify-between lg:py-5`}>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-8">
          <ExternalLink href="https://kleros.io" className={`inline-flex ${BAR_FOCUS}`}>
            <img src={securedByKlerosUrl} alt="Secured by Kleros" width={130} height={24} className="h-6 w-auto" />
          </ExternalLink>
          {chainLabel === null ? null : <span className="font-semibold">{chainLabel}</span>}
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
          <ExternalLink href="https://t.me/kleros" className={`inline-flex items-center gap-2 font-semibold hover:underline ${BAR_FOCUS}`}>
            I need help
            <HelpIcon className="size-4" />
          </ExternalLink>
          <ul aria-label="Kleros channels" className="flex flex-wrap items-center justify-center gap-1">
            {explorer === null ? null : (
              <li>
                <ExternalLink href={explorer.href} className={ICON_LINK}>
                  <ExplorerIcon />
                  <span className="sr-only">{`ArbitrableProxy contract on the ${explorer.chainName} explorer`}</span>
                </ExternalLink>
              </li>
            )}
            {SOCIAL_LINKS.map(({ name, href, Icon }) => (
              <li key={name}>
                <ExternalLink href={href} className={ICON_LINK}>
                  <Icon className="size-5" />
                  <span className="sr-only">{name}</span>
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
