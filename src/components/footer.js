import {  Col } from "react-bootstrap";
import React from "react";
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

import networkMap from "../ethereum/network-contract-mapping";


import styles from "./styles/footer.module.css";

const ETHERSCAN_STRINGS = Object.freeze({ 1: "", 3: "ropsten.", 42: "kovan." });

class Footer extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const {  network } = this.props;
    
    return (
      <footer>
        <div className={styles.footer}>
          <a className={`m-auto m-sm-0 ${styles.brand}`} href="https://kleros.io">
            <SecuredByKleros />
          </a>
          <div className={`d-none d-lg-block ml-5`}>
            <Col>{networkMap[network]?.NAME || "Unsupported Network"}</Col>
          </div>
          <div className={`ml-sm-auto ${styles.rest}`}>
            <a className={`d-none d-sm-block ${styles.help}`} href="https://t.me/kleros">
              <span>I need help</span>
              <Help />
            </a>
            <div className={`d-none d-md-block ${styles.social}`}>
              {(network == 1 || network == 3 || network == 42) && (
                <a
                  href={`https://${ETHERSCAN_STRINGS[network]}etherscan.io/address/${this.props.networkMap[network].ARBITRABLE_PROXY}#code`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Etherscan />
                </a>
              )}
              <a href="https://github.com/kleros/dispute-resolver">
                <Github />
              </a>
              <a href="https://slack.kleros.io">
                <Slack />
              </a>
              <a href="https://reddit.com/r/Kleros/">
                <Reddit />
              </a>
              <a href="https://twitter.com/kleros_io">
                <Twitter />
              </a>
              <a href="https://forum.kleros.io">
                <Forum />
              </a>
              <a href="https://t.me/kleros">
                <Telegram />
              </a>
              <a href="https://www.linkedin.com/company/kleros/">
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
