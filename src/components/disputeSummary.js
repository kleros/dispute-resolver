import { Row, Col, Form} from "react-bootstrap";
import React from "react";
import {ReactComponent as AttachmentSVG} from "../assets/images/attachment.svg";
import {getReadOnlyRpcUrl} from "../ethereum/network-contract-mapping";

import styles from "components/styles/disputeSummary.module.css";
import ReactMarkdown from "react-markdown";

class DisputeSummary extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {
      metaevidenceJSON,
      ipfsGateway,
      arbitrated,
      arbitratorDisputeID,
      arbitratorAddress,
      arbitratorChainID,
      arbitrableChainID,
      chainID, // Deprecated. Use arbitrableChainID or arbitratorChainID instead.
      web3Provider,
      loading,
    } = this.props;

    const injectedArgs = {
      disputeID: arbitratorDisputeID,
      chainID: chainID, // Deprecated. Use arbitrableChainID or arbitratorChainID instead.
      arbitratorContractAddress: arbitratorAddress,
      arbitratorJsonRpcUrl: getReadOnlyRpcUrl({chainId: arbitratorChainID}) ?? web3Provider,
      arbitratorChainID: arbitratorChainID,
      arbitrableContractAddress: arbitrated,
      arbitrableChainID: arbitrableChainID,
      arbitrableJsonRpcUrl: getReadOnlyRpcUrl({chainId: arbitrableChainID}) ?? web3Provider,
      jsonRpcUrl: web3Provider,
    };


    if (metaevidenceJSON) {
      let searchParams;
      const {_v = "0"} = metaevidenceJSON;
      if (_v === "0") {
        searchParams = `${encodeURIComponent(JSON.stringify(injectedArgs))}`;
      } else {
        const _searchParams = new URLSearchParams(injectedArgs);
        searchParams = `${_searchParams.toString()}`;
      }
      return (
        <section className={styles.disputeSummary}>
          <div className={styles.inner}>
            <p className={styles.interactWithTheDispute}>Interact with the dispute</p>
            <h1 className={styles.h1}>{metaevidenceJSON.title}</h1>
            <hr/>
              <ReactMarkdown  className={styles.description} source={metaevidenceJSON.description} />

            {metaevidenceJSON.evidenceDisplayInterfaceURI && (
              <iframe
                className="border-0"
                style={{width: "100%", height: "360px"}}
                src={(metaevidenceJSON.evidenceDisplayInterfaceURI.includes("://") ? "" : ipfsGateway) + `${metaevidenceJSON.evidenceDisplayInterfaceURI}?${searchParams}`}
                title="evidence-display"
              />
            )}
            {metaevidenceJSON.arbitrableInterfaceURI && !metaevidenceJSON.arbitrableInterfaceURI.includes("resolve.kleros.io") && (
              <div className="my-3">
                <a href={metaEvidenceJSON.arbitrableInterfaceURI} className="purple-inverted">
                  Go to arbitrable application from here
                </a>
              </div>
            )}

            {metaevidenceJSON.aliases && (
              <Row>
                {Object.entries(metaevidenceJSON.aliases).map(([key, value], index) => (
                  <React.Fragment key={index}>
                    <Col>
                      <Form.Group>
                        <Form.Label htmlFor="alias">Party {index + 1} </Form.Label>

                        <Form.Control id="alias" as="span" title={value}>
                          {value}
                        </Form.Control>
                      </Form.Group>
                    </Col>
                    <Col>
                      <Form.Group>
                        <Form.Label htmlFor="address">Party {index + 1} Address</Form.Label>

                        <Form.Control id="address" as="span" title={key}>
                          {key}
                        </Form.Control>
                      </Form.Group>
                    </Col>
                  </React.Fragment>
                ))}
              </Row>
            )}
          </div>
          {metaevidenceJSON.fileURI && (
            <Row className={styles.footer}>
              <Col>
                <a href={ipfsGateway + metaevidenceJSON.fileURI} target="_blank" rel="noopener noreferrer">
                  <AttachmentSVG/>
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
