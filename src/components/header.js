import React from "react";
import PropTypes from "prop-types";
import { Navbar, Nav } from "react-bootstrap";
import { LinkContainer } from "react-router-bootstrap";
import { ReactComponent as Brand } from "../assets/images/logo-dispute-resolver-white.svg";
import { ReactComponent as WarningIcon } from "../assets/images/warning.svg";
import { CONNECTION, EXAMPLES } from "../wallet/walletStatus";
import styles from "./styles/header.module.css";

const CONNECT_LABEL = "Connect wallet";
const CONNECTING_LABEL = "Connecting…";
const UNSUPPORTED_NETWORK = "Unsupported Network";
const VIEW_ONLY_COPY = "You can only browse disputes.";
const SMART_CONTRACT_WALLET_FAQ_URL = "https://docs.kleros.io/welcome/faq#can-i-use-a-smart-contract-account-to-stake-in-the-court";
const WARNING_STORAGE_KEY = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";
const NO_ACTIONS = Object.freeze({ connect: async () => {} });

//A missing or partial status (an old caller, a bad state) renders like a wallet that is still connecting: banner without an action, no chain chrome, navigation intact.
const normaliseStatus = (status) => (status && typeof status === "object" ? { ...EXAMPLES.CONNECTING, ...status } : EXAMPLES.CONNECTING);
const normaliseActions = (actions) => (actions && typeof actions.connect === "function" ? actions : NO_ACTIONS);

const shortenAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const warningStorageKey = (address) => `${WARNING_STORAGE_KEY}:${address}`;

//The dismissal is stored as "false" (the old showWarning flag) so dismissals made before this header keep counting.
const isWarningDismissed = (address) => {
  try {
    return localStorage.getItem(warningStorageKey(address)) === "false";
  } catch {
    return false;
  }
};

const storeWarningDismissal = (address) => {
  try {
    localStorage.setItem(warningStorageKey(address), "false");
  } catch (error) {
    console.warn("Could not store the smart contract wallet warning dismissal", error);
  }
};

class Header extends React.Component {
  state = { connecting: false, warningDismissedFor: null };

  componentDidMount() {
    this.mounted = true;
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  handleConnect = async () => {
    if (this.state.connecting) return;
    this.setState({ connecting: true });
    try {
      await normaliseActions(this.props.actions).connect();
    } catch (error) {
      //The adapter reports the outcome through the next status; the header only has to stay usable.
      console.warn("Wallet connection did not complete", error);
    } finally {
      if (this.mounted) this.setState({ connecting: false });
    }
  };

  handleDismissWarning = () => {
    const { address } = normaliseStatus(this.props.status);
    storeWarningDismissal(address);
    this.setState({ warningDismissedFor: address });
  };

  renderConnectButton(className, label = CONNECT_LABEL) {
    const { connecting } = this.state;
    return (
      <button type="button" className={className} onClick={this.handleConnect} disabled={connecting}>
        {connecting ? CONNECTING_LABEL : label}
      </button>
    );
  }

  renderWalletArea(status) {
    const { connection, walletDetected, address, chain, error } = status;
    const chainName = chain && chain.supported !== false ? chain.name : null;
    let content = null;
    if (connection === CONNECTION.CONNECTED && address) {
      content = (
        <>
          <span className={`${styles.pill} ${styles.account}`} title={address}>
            {shortenAddress(address)}
          </span>
          {chainName && <span className={styles.pill}>{chainName}</span>}
        </>
      );
    } else if (connection === CONNECTION.CONNECTING) {
      content = <span className={styles.connecting}>{CONNECTING_LABEL}</span>;
    } else if (connection === CONNECTION.ERROR) {
      content = (
        <>
          <span className={styles.error}>{error?.message ?? "Wallet connection failed."}</span>
          {walletDetected && this.renderConnectButton(styles.connect, "Retry")}
        </>
      );
    } else if (walletDetected) {
      content = this.renderConnectButton(styles.connect);
    }

    return (
      <div className={styles.wallet}>
        {chain?.supported === false && <span className={`${styles.pill} ${styles.unsupported}`}>{UNSUPPORTED_NETWORK}</span>}
        {content}
      </div>
    );
  }

  renderViewOnlyBanner() {
    return (
      <div className={styles.notice} role="status">
        <div className={styles.noticeCard}>
          <div className={styles.cardText}>
            <p className={styles.cardTitle}>Read-only mode</p>
            <p className={styles.cardBody}>{VIEW_ONLY_COPY}</p>
          </div>
        </div>
      </div>
    );
  }

  renderSmartContractWalletWarning() {
    return (
      <div className={styles.notice} role="alert">
        <div className={`${styles.noticeCard} ${styles.warning}`}>
          <WarningIcon className={styles.warningIcon} aria-hidden="true" />
          <div className={styles.cardText}>
            <p className={styles.cardTitle}>Warning</p>
            <p className={styles.cardBody}>
              You are using a smart contract wallet. This is not recommended.{" "}
              <a href={SMART_CONTRACT_WALLET_FAQ_URL} target="_blank" rel="noopener noreferrer">
                Learn more.
              </a>
            </p>
          </div>
          <button type="button" className={styles.dismiss} onClick={this.handleDismissWarning} aria-label="Dismiss warning">
            ×
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { route } = this.props;
    const status = normaliseStatus(this.props.status);
    const { address, isSmartContractWallet } = status;
    const viewOnly = Boolean(status.viewOnly);
    const chainId = route.match.params.chainId;
    const showWarning = isSmartContractWallet === true && Boolean(address) && this.state.warningDismissedFor !== address && !isWarningDismissed(address);

    return (
      <header className={styles.header}>
        <Navbar collapseOnSelect expand="lg" variant="dark" className={styles.navbar} aria-label="Main">
          <div className={styles.inner}>
            <Navbar.Brand href={`/${chainId}`} className={styles.brand} aria-label="Dispute Resolver home">
              <Brand />
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="responsive-navbar-nav" />
            <Navbar.Collapse id="responsive-navbar-nav">
              <Nav className={styles.nav}>
                <LinkContainer to={`/${chainId}/ongoing/`}>
                  <Nav.Link>Ongoing Disputes</Nav.Link>
                </LinkContainer>
                {!viewOnly && (
                  <LinkContainer exact to={`/${chainId}/create/`}>
                    <Nav.Link>Create</Nav.Link>
                  </LinkContainer>
                )}
                <LinkContainer exact to={`/${chainId}/cases/`}>
                  <Nav.Link>Case Lookup</Nav.Link>
                </LinkContainer>
              </Nav>
              {this.renderWalletArea(status)}
            </Navbar.Collapse>
          </div>
        </Navbar>
        {viewOnly && this.renderViewOnlyBanner()}
        {showWarning && this.renderSmartContractWalletWarning()}
      </header>
    );
  }
}

export default Header;

const chainShape = PropTypes.shape({
  id: PropTypes.string,
  supported: PropTypes.bool,
  name: PropTypes.string,
  testnet: PropTypes.bool,
  currency: PropTypes.string,
  contractExplorerUrl: PropTypes.string,
});

Header.propTypes = {
  status: PropTypes.shape({
    connection: PropTypes.oneOf(Object.values(CONNECTION)),
    walletDetected: PropTypes.bool,
    address: PropTypes.string,
    chain: chainShape,
    viewOnly: PropTypes.bool,
    isSmartContractWallet: PropTypes.bool,
    error: PropTypes.shape({ code: PropTypes.string, message: PropTypes.string }),
  }),
  actions: PropTypes.shape({ connect: PropTypes.func }),
  route: PropTypes.shape({ match: PropTypes.shape({ params: PropTypes.shape({ chainId: PropTypes.string }) }) }).isRequired,
};
