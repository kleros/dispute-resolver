import React from "react";
import PropTypes from "prop-types";
import { ReactComponent as Etherscan } from "../assets/images/etherscan.svg";
import { ReactComponent as Github } from "../assets/images/github.svg";
import { ReactComponent as Slack } from "../assets/images/slack.svg";
import { ReactComponent as Reddit } from "../assets/images/reddit.svg";
import { ReactComponent as Twitter } from "../assets/images/twitter.svg";
import { ReactComponent as Forum } from "../assets/images/ghost.svg";
import { ReactComponent as Telegram } from "../assets/images/telegram.svg";
import { ReactComponent as LinkedIn } from "../assets/images/linkedin.svg";
import { ReactComponent as Help } from "../assets/images/help.svg";
import { ReactComponent as SecuredByKleros } from "../assets/images/securedByKleros.svg";

import styles from "./styles/footer.module.css";

const UNSUPPORTED_NETWORK = "Unsupported Network";

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
          <a className={styles.brand} href="https://kleros.io" aria-label="Secured by Kleros">
            <SecuredByKleros />
          </a>
          <div className={styles.chain}>{this.renderChain(chain)}</div>
          <div className={styles.rest}>
            <a className={styles.help} href="https://t.me/kleros">
              <span>I need help</span>
              <Help aria-hidden="true" />
            </a>
            <div className={styles.social}>
              {explorerUrl && (
                <a className={styles.explorer} href={explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="Arbitrable proxy contract on the block explorer">
                  <Etherscan />
                </a>
              )}
              <a href="https://github.com/kleros/dispute-resolver" aria-label="GitHub">
                <Github />
              </a>
              <a href="https://slack.kleros.io" aria-label="Slack">
                <Slack />
              </a>
              <a href="https://reddit.com/r/Kleros/" aria-label="Reddit">
                <Reddit />
              </a>
              <a href="https://twitter.com/kleros_io" aria-label="Twitter">
                <Twitter />
              </a>
              <a href="https://forum.kleros.io" aria-label="Forum">
                <Forum />
              </a>
              <a href="https://t.me/kleros" aria-label="Telegram">
                <Telegram />
              </a>
              <a href="https://www.linkedin.com/company/kleros/" aria-label="LinkedIn">
                <LinkedIn />
              </a>
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
