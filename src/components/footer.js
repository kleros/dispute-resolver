import React from "react";
import PropTypes from "prop-types";
import { ReactComponent as Etherscan } from "../assets/images/etherscan.svg";
import { ReactComponent as Github } from "../assets/images/github.svg";
import { ReactComponent as Reddit } from "../assets/images/reddit.svg";
import { ReactComponent as Twitter } from "../assets/images/twitter.svg";
import { ReactComponent as Forum } from "../assets/images/ghost.svg";
import { ReactComponent as Telegram } from "../assets/images/telegram.svg";
import { ReactComponent as LinkedIn } from "../assets/images/linkedin.svg";
import { ReactComponent as Help } from "../assets/images/help.svg";
import { ReactComponent as SecuredByKleros } from "../assets/images/securedByKleros.svg";

import styles from "./styles/footer.module.css";

const UNSUPPORTED_NETWORK = "Unsupported Network";
const HELP_URL = "https://t.me/kleros";

const NEW_TAB = Object.freeze({ target: "_blank", rel: "noopener noreferrer" });

const SOCIAL_LINKS = Object.freeze([
  { href: "https://github.com/kleros/dispute-resolver", label: "GitHub", Icon: Github },
  { href: "https://reddit.com/r/Kleros/", label: "Reddit", Icon: Reddit },
  { href: "https://twitter.com/kleros_io", label: "Twitter", Icon: Twitter },
  { href: "https://forum.kleros.io", label: "Forum", Icon: Forum },
  { href: HELP_URL, label: "Telegram", Icon: Telegram },
  { href: "https://www.linkedin.com/company/kleros/", label: "LinkedIn", Icon: LinkedIn },
]);

class Footer extends React.Component {
  //The chain comes from the status alone: its name (flagged when it is a testnet), the unsupported notice, or a placeholder while it is unknown.
  renderChain(chain) {
    if (chain?.supported === false) return <span className={`${styles.pill} ${styles.unsupported}`}>{UNSUPPORTED_NETWORK}</span>;
    if (chain?.name) {
      return (
        <span className={styles.pill}>
          {chain.name}
          {chain.testnet && <span className={styles.testnet}>Testnet</span>}
        </span>
      );
    }
    return <span className={`skeleton ${styles.chainPlaceholder}`} aria-hidden="true" />;
  }

  render() {
    const chain = this.props.status?.chain ?? null;
    const explorerUrl = chain?.contractExplorerUrl;

    return (
      <footer className={styles.footer}>
        <div className={styles.inner}>
          <a className={styles.brand} href="https://kleros.io" aria-label="Secured by Kleros" {...NEW_TAB}>
            <SecuredByKleros />
          </a>
          <div className={styles.chain}>{this.renderChain(chain)}</div>
          <div className={styles.rest}>
            <a className={styles.help} href={HELP_URL} {...NEW_TAB}>
              <span>I need help</span>
              <Help aria-hidden="true" />
            </a>
            <div className={styles.social}>
              {explorerUrl && (
                <a className={styles.explorer} href={explorerUrl} aria-label="Arbitrable proxy contract on the block explorer" {...NEW_TAB}>
                  <Etherscan />
                </a>
              )}
              {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                <a key={label} href={href} aria-label={label} {...NEW_TAB}>
                  <Icon />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    );
  }
}

export default Footer;

Footer.propTypes = {
  status: PropTypes.shape({
    chain: PropTypes.shape({
      id: PropTypes.string,
      supported: PropTypes.bool,
      name: PropTypes.string,
      testnet: PropTypes.bool,
      currency: PropTypes.string,
      contractExplorerUrl: PropTypes.string,
    }),
  }),
};
