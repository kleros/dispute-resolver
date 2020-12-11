import { Card, Row, Col, Form } from "react-bootstrap";
import React from "react";

import styles from "components/styles/disputeSummary.module.css";

class DisputeSummary extends React.Component {
  render() {
    const { metaevidenceJSON } = this.props;
    console.log(metaevidenceJSON);

    if (metaevidenceJSON)
      return (
        <section className={styles.disputeSummary}>
          <p className={styles.interactWithTheDispute}>Interact with the dispute</p>
          <h1 className={styles.h1}>{metaevidenceJSON.title}</h1>
          <hr />
          <p className={styles.description}>{metaevidenceJSON.description}</p>
          <div className={styles.footer}>{metaevidenceJSON.primaryDocument}</div>
          <Row>
            {Object.entries(metaevidenceJSON.aliases).map(([key, value]) => (
              <>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="requester">Party </Form.Label>

                    <Form.Control id={``} as="span" title={""}>
                      {value}
                    </Form.Control>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor={`address`}>Party Address </Form.Label>

                    <Form.Control id="requesterAddress" as="span" title={""}>
                      {key}
                    </Form.Control>
                  </Form.Group>
                </Col>
              </>
            ))}
          </Row>
        </section>
      );
    else return <div></div>;
  }
}

export default DisputeSummary;
