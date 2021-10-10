import { Card, Row, Col, Form, Container } from "react-bootstrap";
import React from "react";
import { ReactComponent as AttachmentSVG } from "../assets/images/attachment.svg";

import styles from "components/styles/disputeSummary.module.css";

class DisputeSummary extends React.Component {
  render() {
    const {
      metaevidenceJSON,
      ipfsGateway,
      interfaceValid,
      arbitrated,
      arbitratorDisputeID,
      arbitratorAddress,
      arbitratorChainID,
      arbitrableChainID,
      arbitratorJsonRpcUrl,
      arbitrableJsonRpcUrl,
    } = this.props;
    console.debug(this.props);

    const injectedParams = {
      disputeID: arbitratorDisputeID,
      arbitratorContractAddress: arbitratorAddress,
      arbitratorJsonRpcUrl: arbitratorJsonRpcUrl,
      arbitratorChainID: arbitratorChainID,
      arbitrableContractAddress: arbitrated,
      arbitrableChainID: arbitrableChainID,
      arbitrableJsonRpcUrl: arbitrableJsonRpcUrl,
    };

    if (metaevidenceJSON)
      return (
        <section className={styles.disputeSummary}>
          <div className={styles.inner}>
            <p className={styles.interactWithTheDispute}>Interact with the dispute</p>
            <h1 className={styles.h1}>{metaevidenceJSON.title}</h1>
            <hr />
            <p className={styles.description}>{metaevidenceJSON.description}</p>

            {metaevidenceJSON.evidenceDisplayInterfaceURI && (
              <iframe
                className="border-0"
                src={
                  (metaevidenceJSON.evidenceDisplayInterfaceURI.includes("://")
                    ? metaevidenceJSON.evidenceDisplayInterfaceURI
                    : `https://ipfs.kleros.io${metaevidenceJSON.evidenceDisplayInterfaceURI}?`) + encodeURIComponent(JSON.stringify(injectedParams))
                }
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
                  <AttachmentSVG />
                  {metaevidenceJSON.fileURI.split("/").slice(-1)}
                </a>
              </Col>
            </Row>
          )}
        </section>
      );
    else return <div></div>;
  }
}

export default DisputeSummary;
