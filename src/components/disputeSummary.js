import { Row, Col, Form } from "react-bootstrap";
import React from "react";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";
import { getReadOnlyRpcUrl } from "../ethereum/network-contract-mapping";
import whitelistedArbitrables from "../ethereum/arbitrableWhitelist";

import styles from "components/styles/disputeSummary.module.css";
import ReactMarkdown from "react-markdown";

class DisputeSummary extends React.Component {
  getArbitratorConfig() {
    const { arbitratorDisputeID, arbitratorAddress, arbitratorChainID, chainID, web3Provider } = this.props;
    return {
      disputeID: arbitratorDisputeID,
      parsedChainID: parseInt(chainID, 10),
      arbitratorContractAddress: arbitratorAddress,
      arbitratorJsonRpcUrl: getReadOnlyRpcUrl({ chainId: arbitratorChainID }) ?? web3Provider,
      arbitratorChainID: parseInt(arbitratorChainID, 10),
    };
  }

  getArbitrableConfig() {
    const { arbitrableChainID, arbitrated, web3Provider } = this.props;
    return {
      arbitrableContractAddress: arbitrated,
      arbitrableChainID: parseInt(arbitrableChainID, 10),
      arbitrableJsonRpcUrl: getReadOnlyRpcUrl({ chainId: arbitrableChainID }) ?? web3Provider,
    };
  }

  getInjectedArgs() {
    const { web3Provider, chainID } = this.props;
    // Convert web3Provider object to URL string if needed
    const jsonRpcUrl = typeof web3Provider === 'object'
      ? getReadOnlyRpcUrl({ chainId: chainID })
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
    if (!metaevidenceJSON.aliases) return null;

    return (
      <Row>
        {Object.entries(metaevidenceJSON.aliases).map(([key, value]) => (
          <React.Fragment key={key}>
            <Col>
              <Form.Group>
                <Form.Label htmlFor="alias">Party {Object.keys(metaevidenceJSON.aliases).indexOf(key) + 1} </Form.Label>
                <Form.Control id="alias" as="span" title={value}>
                  {value}
                </Form.Control>
              </Form.Group>
            </Col>
            <Col>
              <Form.Group>
                <Form.Label htmlFor="address">Party {Object.keys(metaevidenceJSON.aliases).indexOf(key) + 1} Address</Form.Label>
                <Form.Control id="address" as="span" title={key}>
                  {key}
                </Form.Control>
              </Form.Group>
            </Col>
          </React.Fragment>
        ))}
      </Row>
    );
  }

  render() {
    const { metaevidenceJSON, ipfsGateway, arbitrated, arbitratorChainID, loading } = this.props;

    if (metaevidenceJSON) {
      const injectedArgs = this.getInjectedArgs();
      console.debug('🔍 [DisputeSummary] metaevidenceJSON:', metaevidenceJSON);
      console.debug('🔍 [DisputeSummary] injectedArgs:', injectedArgs);
      const searchParams = this.getSearchParams(injectedArgs, metaevidenceJSON);
      console.debug('🔍 [DisputeSummary] searchParams:', searchParams);

      return (
        <section className={styles.disputeSummary}>
          <div className={styles.inner}>
            <p className={styles.interactWithTheDispute}>Interact with the dispute</p>
            <h1 className={styles.h1}>{metaevidenceJSON.title}</h1>
            <hr />
            <ReactMarkdown className={styles.description} source={metaevidenceJSON.description} />

            {metaevidenceJSON.evidenceDisplayInterfaceURI && (() => {
              const iframeSrc = (metaevidenceJSON.evidenceDisplayInterfaceURI.includes("://") ? "" : ipfsGateway) + `${metaevidenceJSON.evidenceDisplayInterfaceURI}?${searchParams}`;
              console.debug('🔍 [DisputeSummary] iframe src:', iframeSrc);
              console.debug('🔍 [DisputeSummary] evidenceDisplayInterfaceURI:', metaevidenceJSON.evidenceDisplayInterfaceURI);
              return (
                <iframe
                  sandbox={
                    whitelistedArbitrables[arbitratorChainID]?.includes(arbitrated.toLowerCase())
                      ? "allow-scripts allow-same-origin"
                      : "allow-scripts"
                  }
                  className="border-0"
                  style={{ width: "100%", height: "360px" }}
                  src={iframeSrc}
                  title="evidence-display"
                />
              );
            })()}
            {metaevidenceJSON.arbitrableInterfaceURI && !metaevidenceJSON.arbitrableInterfaceURI.includes("resolve.kleros.io") && (
              <div className="my-3">
                <a href={metaevidenceJSON.arbitrableInterfaceURI} className="purple-inverted">
                  Go to arbitrable application from here
                </a>
              </div>
            )}

            {this.renderAliases(metaevidenceJSON)}
          </div>
          {metaevidenceJSON.fileURI && (
            <Row className={styles.footer}>
              <Col>
                <a href={ipfsGateway + metaevidenceJSON.fileURI} target="_blank" rel="noopener noreferrer">
                  <AttachmentSVG />
                  {metaevidenceJSON.fileURI.split("/").slice(-1)}
                </a>
              </Col>
            </Row>
          )}
        </section>
      );
    } else if (loading) return <div>Fetching....</div>;
    else return <div>Failed to load metaevidence, thus the dispute summary. This might be an issue with the IPFS access.</div>;
  }
}

export default DisputeSummary;
