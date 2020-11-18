import React from "react";
import { Accordion, Container, Col, Row, Button, Form, Card, Dropdown, Badge, Spinner } from "react-bootstrap";
import { Redirect, Link } from "react-router-dom";
import OngoingCard from "components/ongoing-card.js";
import styles from "containers/styles/open-disputes.module.css";

const span = Object.freeze({ xs: 12, sm: 12, md: 6, lg: 6, xl: 4 });

class openDisputeIDs extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [], arbitratorDisputes: {}, loading: true };
  }
  componentDidMount() {
    this.props.getOpenDisputesOnCourtCallback().then((openDisputeIDs) => {
      this.setState({ openDisputeIDs: openDisputeIDs });

      openDisputeIDs.map((arbitratorDispute) => {
        this.props.getArbitratorDisputeCallback(arbitratorDispute).then((arbitratorDisputeDetails) => {
          this.setState({ ["arbitrator" + arbitratorDispute]: arbitratorDisputeDetails });
          this.props.getMetaEvidenceCallback(arbitratorDisputeDetails.arbitrated, arbitratorDispute).then((metaevidence) => {
            this.setState({ [arbitratorDispute]: metaevidence });
          });
        });

        this.props.getCurrentRulingCallback(arbitratorDispute).then((ruling) => this.setState({ ["arbitratorRuling" + arbitratorDispute]: ruling }));
      });
      this.setState({ loading: false });
    });
  }

  render() {
    console.debug(this.state);
    console.debug(this.props);

    const { openDisputeIDs, selectedDispute } = this.state;
    const { subcourts, subcourtDetails } = this.props;

    return (
      <main className={styles.openDisputes}>
        <Container fluid className="main-content" id="ongoing-disputes">
          <Form.Row style={{ margin: 0, padding: 0 }}>
            {openDisputeIDs.map((dispute) => (
              <Col className={styles.card} style={{ display: "flex", flexDirection: "column" }} key={dispute} xl={span.xl} lg={span.lg} md={span.md} sm={span.sm} xs={span.xs}>
                <a style={{ display: "contents", textDecoration: "none", color: "unset" }} href={`/cases/${dispute}`}>
                  {this.state[dispute] && <OngoingCard dispute={dispute} arbitratorDisputeDetails={this.state[`arbitrator${dispute}`]} title={this.state[dispute].title} subcourtDetails={subcourtDetails} subcourts={subcourts} />}
                </a>
              </Col>
            ))}
            {!this.state.loading && openDisputeIDs.length == 0 && (
              <Col style={{ textAlign: "center", marginTop: "5rem" }}>
                <h1>There are no open disputes.</h1>
              </Col>
            )}
            {this.state.loading && (
              <div style={{ margin: "auto", marginTop: "5vh" }}>
                <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" style={{ width: "5rem", height: "5rem" }} className="purple-inverted" />
              </div>
            )}
          </Form.Row>
        </Container>
      </main>
    );
  }
}

export default openDisputeIDs;
