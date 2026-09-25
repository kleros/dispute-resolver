import React from "react";
import PropTypes from "prop-types";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { getReadOnlyRpcUrl } from "../ethereum/network-contract-mapping";
import whitelistedArbitrables from "../ethereum/arbitrableWhitelist";
import AlertMessage from "components/alertMessage";

import styles from "components/styles/disputeSummary.module.css";
import ReactMarkdown from "react-markdown";
import { urlNormalize } from "../utils/urlNormalizer";
import { isSafeNavigationUrl } from "../utils/urlValidation";

//Meta-evidence comes from the arbitrable and may not follow the standard; chain IDs it names may be unknown here.
const readOnlyRpcUrl = chainId => {
  try {
    return getReadOnlyRpcUrl({ chainId });
  } catch {
    return undefined;
  }
};

const isNonEmptyString = value => typeof value === "string" && value.trim() !== "";

class DisputeSummary extends React.Component {
  getArbitratorConfig() {
    const { arbitratorDisputeID, arbitratorAddress, arbitratorChainID, chainID, web3Provider } = this.props;
    return {
      disputeID: arbitratorDisputeID,
      chainID: Number.parseInt(chainID, 10),
      arbitratorContractAddress: arbitratorAddress,
      arbitratorJsonRpcUrl: readOnlyRpcUrl(arbitratorChainID) ?? web3Provider,
      arbitratorChainID: Number.parseInt(arbitratorChainID, 10),
    };
  }

  getArbitrableConfig() {
    const { arbitrableChainID, arbitrated, web3Provider } = this.props;
    return {
      arbitrableContractAddress: arbitrated,
      arbitrableChainID: Number.parseInt(arbitrableChainID, 10),
      arbitrableJsonRpcUrl: readOnlyRpcUrl(arbitrableChainID) ?? web3Provider,
    };
  }

  getInjectedArgs() {
    const { web3Provider, chainID } = this.props;
    // Convert web3Provider object to URL string if needed
    const jsonRpcUrl = typeof web3Provider === 'object'
      ? readOnlyRpcUrl(chainID)
      : web3Provider;

    // Follow Kleros Court approach: only pass essential parameters
    // Do NOT pass block range parameters - let evidence interfaces handle optimization internally
    const baseArgs = {
      ...this.getArbitratorConfig(),
      ...this.getArbitrableConfig(),
      jsonRpcUrl,
    };

    return baseArgs;
  }

  getSearchParams(injectedArgs, metaevidenceJSON) {
    const { _v = "0" } = metaevidenceJSON;
    if (_v === "0") {
      return `${encodeURIComponent(JSON.stringify(injectedArgs))}`;
    }
    const _searchParams = new URLSearchParams(injectedArgs);
    return `${_searchParams.toString()}`;
  }

  renderAliases(metaevidenceJSON) {
    const { aliases } = metaevidenceJSON;
    if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) return null;

    return (
      <dl className={styles.parties}>
        {Object.entries(aliases).map(([key, alias], index) => {
          const value = isNonEmptyString(alias) ? alias : "Unavailable";
          return (
            <div className={styles.party} key={key}>
              <dt>Party {index + 1}</dt>
              <dd>
                <strong title={value}>{value}</strong>
                <span className={styles.address} title={key}>{key}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  //The evidence display of the arbitrable, when it names one that is safe to load.
  renderEvidenceDisplay(metaevidenceJSON, evidenceDisplayInterfaceURI) {
    const { arbitrated, arbitrableChainID } = this.props;
    const injectedArgs = this.getInjectedArgs();
    console.debug('🔍 [DisputeSummary] metaevidenceJSON:', metaevidenceJSON);
    console.debug('🔍 [DisputeSummary] injectedArgs:', injectedArgs);
    const searchParams = this.getSearchParams(injectedArgs, metaevidenceJSON);
    console.debug('🔍 [DisputeSummary] searchParams:', searchParams);

    // hack to allow displaying old t2cr disputes, since old endpoint was lost
    const displayInterfaceURI = arbitrated === "0xEbcf3bcA271B26ae4B162Ba560e243055Af0E679"
      ? "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html"
      : evidenceDisplayInterfaceURI;

    const resolvedURI = displayInterfaceURI.includes("://")
      ? displayInterfaceURI
      : urlNormalize(displayInterfaceURI);
    if (!isSafeNavigationUrl(resolvedURI)) return null;
    const iframeSrc = `${resolvedURI}?${searchParams}`;
    console.debug('🔍 [DisputeSummary] iframe src:', iframeSrc);
    console.debug('🔍 [DisputeSummary] evidenceDisplayInterfaceURI:', displayInterfaceURI);
    return (
      <iframe
        sandbox={
          whitelistedArbitrables[arbitrableChainID]?.includes(arbitrated.toLowerCase())
            ? "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            : "allow-scripts"
        }
        className={styles.evidenceDisplay}
        src={iframeSrc}
        title="evidence-display"
      />
    );
  }

  render() {
    const { metaevidenceJSON } = this.props;

    if (!metaevidenceJSON || typeof metaevidenceJSON !== "object") {
      return (
        <section className={styles.disputeSummary} id="summary">
          <h2>Summary</h2>
          <AlertMessage
            type="warning"
            extraClass={styles.alert}
            title="Summary unavailable"
            content="Failed to load metaevidence, thus the dispute summary. This might be an issue with the IPFS access."
          />
        </section>
      );
    }

    //Non-standard arbitrables may put anything in these fields; only strings are rendered.
    const description = isNonEmptyString(metaevidenceJSON.description) ? metaevidenceJSON.description : null;
    const evidenceDisplayInterfaceURI = isNonEmptyString(metaevidenceJSON.evidenceDisplayInterfaceURI) ? metaevidenceJSON.evidenceDisplayInterfaceURI : null;
    const arbitrableInterfaceURI = isNonEmptyString(metaevidenceJSON.arbitrableInterfaceURI) ? metaevidenceJSON.arbitrableInterfaceURI : null;
    const fileURI = isNonEmptyString(metaevidenceJSON.fileURI) ? metaevidenceJSON.fileURI : null;
    const parties = this.renderAliases(metaevidenceJSON);
    const showArbitrableLink = arbitrableInterfaceURI && !arbitrableInterfaceURI.includes("resolve.kleros.io") && isSafeNavigationUrl(arbitrableInterfaceURI);

    if (!description && !evidenceDisplayInterfaceURI && !showArbitrableLink && !fileURI && !parties) return null;

    return (
      <section className={styles.disputeSummary} id="summary">
        <h2>Summary</h2>
        {/*
          * By default, ReactMarkdown 4 escapes HTML. Changing this without sanitizing the input could expose us to XSS attacks.
          * Another potential safety issue can come from updating ReactMarkdown version and adding the rehype-raw plugin, for instance.
        */}
        {description != null && <ReactMarkdown className={styles.description} source={description} />}

        {evidenceDisplayInterfaceURI && this.renderEvidenceDisplay(metaevidenceJSON, evidenceDisplayInterfaceURI)}

        {parties}

        {(showArbitrableLink || fileURI) && (
          <div className={styles.links}>
            {fileURI && (
              <a href={urlNormalize(fileURI)} target="_blank" rel="noopener noreferrer">
                <AttachmentSVG aria-hidden="true" />
                <span>{fileURI.split("/").slice(-1)}</span>
              </a>
            )}
            {showArbitrableLink && (
              <a href={arbitrableInterfaceURI} target="_blank" rel="noopener noreferrer">
                <span>Open the arbitrable application</span>
                <span aria-hidden="true"> ↗</span>
              </a>
            )}
          </div>
        )}
      </section>
    );
  }
}

DisputeSummary.propTypes = {
  //Meta-evidence is written by the arbitrable and may not follow the standard, so its fields are checked when rendered, not here.
  metaevidenceJSON: PropTypes.object,
  arbitrated: PropTypes.string,
  arbitrableChainID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  arbitratorChainID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  arbitratorDisputeID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  arbitratorAddress: PropTypes.string,
  chainID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  web3Provider: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
};

export default DisputeSummary;
