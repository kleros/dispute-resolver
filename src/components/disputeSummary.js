import { Row, Col, Form } from "react-bootstrap";
import React from "react";
import PropTypes from "prop-types";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { getReadOnlyRpcUrl } from "../ethereum/network-contract-mapping";
import whitelistedArbitrables from "../ethereum/arbitrableWhitelist";

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
      <Row>
        {Object.entries(aliases).map(([key, alias]) => {
          const value = isNonEmptyString(alias) ? alias : "Unavailable";
          return (
          <React.Fragment key={key}>
            <Col>
              <Form.Group>
                <Form.Label htmlFor="alias">Party {Object.keys(aliases).indexOf(key) + 1} </Form.Label>
                <Form.Control id="alias" as="span" title={value}>
                  {value}
                </Form.Control>
              </Form.Group>
            </Col>
            <Col>
              <Form.Group>
                <Form.Label htmlFor="address">Party {Object.keys(aliases).indexOf(key) + 1} Address</Form.Label>
                <Form.Control id="address" as="span" title={key}>
                  {key}
                </Form.Control>
              </Form.Group>
            </Col>
          </React.Fragment>
          );
        })}
      </Row>
    );
  }

  render() {
    const { metaevidenceJSON, arbitrated, arbitrableChainID } = this.props;

    if (metaevidenceJSON && typeof metaevidenceJSON === "object") {
      const injectedArgs = this.getInjectedArgs();
      console.debug('🔍 [DisputeSummary] metaevidenceJSON:', metaevidenceJSON);
      console.debug('🔍 [DisputeSummary] injectedArgs:', injectedArgs);
      const searchParams = this.getSearchParams(injectedArgs, metaevidenceJSON);
      console.debug('🔍 [DisputeSummary] searchParams:', searchParams);
      //Non-standard arbitrables may put anything in these fields; only strings are rendered.
      const title = isNonEmptyString(metaevidenceJSON.title) ? metaevidenceJSON.title : "Title unavailable";
      const description = typeof metaevidenceJSON.description === "string" ? metaevidenceJSON.description : null;
      const evidenceDisplayInterfaceURI = isNonEmptyString(metaevidenceJSON.evidenceDisplayInterfaceURI) ? metaevidenceJSON.evidenceDisplayInterfaceURI : null;
      const arbitrableInterfaceURI = isNonEmptyString(metaevidenceJSON.arbitrableInterfaceURI) ? metaevidenceJSON.arbitrableInterfaceURI : null;
      const fileURI = isNonEmptyString(metaevidenceJSON.fileURI) ? metaevidenceJSON.fileURI : null;

      return (
        <section className={styles.disputeSummary}>
          <div className={styles.inner}>
            <p className={styles.interactWithTheDispute}>Interact with the dispute</p>
            <h1 className={styles.h1}>{title}</h1>
            <hr />

            {/*
              * By default, ReactMarkdown 4 escapes HTML. Changing this without sanitizing the input could expose us to XSS attacks.
              * Another potential safety issue can come from updating ReactMarkdown version and adding the rehype-raw plugin, for instance.
            */}
            {description != null && <ReactMarkdown className={styles.description} source={description} />}

            {evidenceDisplayInterfaceURI && (() => {
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
                  className="border-0"
                  style={{ width: "100%", height: "360px" }}
                  src={iframeSrc}
                  title="evidence-display"
                />
              );
            })()}
            {arbitrableInterfaceURI && !arbitrableInterfaceURI.includes("resolve.kleros.io") && isSafeNavigationUrl(arbitrableInterfaceURI) && (
              <div className="my-3">
                <a href={arbitrableInterfaceURI} target="_blank" rel="noopener noreferrer" className="purple-inverted">
                  Go to arbitrable application from here
                </a>
              </div>
            )}

            {this.renderAliases(metaevidenceJSON)}
          </div>
          {fileURI && (
            <Row className={styles.footer}>
              <Col>
                <a href={urlNormalize(fileURI)} target="_blank" rel="noopener noreferrer">
                  <AttachmentSVG />
                  {fileURI.split("/").slice(-1)}
                </a>
              </Col>
            </Row>
          )}
        </section>
      );
    }
    return <div>Failed to load metaevidence, thus the dispute summary. This might be an issue with the IPFS access.</div>;
  }
}

DisputeSummary.propTypes = {
  metaevidenceJSON: PropTypes.shape({
    title: PropTypes.string,
    description: PropTypes.string,
    evidenceDisplayInterfaceURI: PropTypes.string,
    arbitrableInterfaceURI: PropTypes.string,
    fileURI: PropTypes.string,
    aliases: PropTypes.object,
    _v: PropTypes.string,
  }),
  arbitrated: PropTypes.string,
  arbitrableChainID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  arbitratorChainID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  arbitratorDisputeID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  arbitratorAddress: PropTypes.string,
  chainID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  web3Provider: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
};

export default DisputeSummary;
