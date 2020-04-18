import React from "react";
import { Accordion, Container, Col, Row, Button, Form, Card, Dropdown } from "react-bootstrap";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { Redirect, Link } from "react-router-dom";
import Countdown from "react-countdown-now";
import BigNumber from "bignumber.js";

const span = Object.freeze({ xs: 12, sm: 12, md: 6, lg: 6, xl: 4 });

class openDisputeIDs extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [] };
  }
  componentDidMount() {
    this.props.getOpenDisputesCallback().then((response) => {
      this.setState({ openDisputeIDs: response.openDisputes });
      response.openDisputes.map((dispute) => this.props.getMetaEvidenceCallback(dispute).then((response) => this.setState({ [dispute]: response })));

      response.openDisputes.map((arbitratorDispute) =>
        this.props.getArbitratorDisputeCallback(arbitratorDispute).then((response) => {
          this.setState({ ["arbitrator" + arbitratorDispute]: response });
        })
      );
    });
  }

  getPeriodName = (periodNumber) => {
    const strings = ["Evidence Period", "Commit Period", "Vote Period", "Appeal Period", "Execution Period"];

    return strings[periodNumber];
  };

  render() {
    console.debug(this.state);
    console.debug(this.props);

    const { openDisputeIDs, selectedDispute } = this.state;
    const { subcourts, subcourtDetails } = this.props;

    if (selectedDispute) return <Redirect to={`/interact/${selectedDispute}`} />;

    return (
      <Container fluid className="main-content">
        <Form.Row style={{ margin: 0 }}>
          {openDisputeIDs.map((dispute) => (
            <Col style={{ display: "flex", flexDirection: "column" }} key={dispute} xl={span.xl} lg={span.lg} md={span.md} sm={span.sm} xs={span.xs}>
              <Card style={{ cursor: "pointer", height: "100%" }} onClick={(e) => this.setState({ selectedDispute: dispute })}>
                <Card.Header>
                  <Form.Row className="w-100">
                    <Col xs={12} style={{ textAlign: "center" }}>
                      <ScalesSVG style={{ float: "left", height: "100%", width: "auto" }} />
                      {this.state[`arbitrator${dispute}`] && subcourtDetails && <span>{subcourtDetails[this.state[`arbitrator${dispute}`].subcourtID].name}</span>}
                      <span style={{ float: "right" }}>{dispute}</span>
                    </Col>
                  </Form.Row>
                </Card.Header>
                <Card.Body style={{ borderRadius: 0 }}>{this.state[dispute] && this.state[dispute].metaEvidenceJSON.title}</Card.Body>
                <Card.Footer style={{ backgroundColor: "#F5F1FD", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px", borderTop: 0, textAlign: "end" }}>
                  {this.state[`arbitrator${dispute}`] && subcourts && (
                    <>
                      {this.getPeriodName(this.state[`arbitrator${dispute}`].period)}{" "}
                      <Countdown
                        date={BigNumber("1000")
                          .times(BigNumber(this.state[`arbitrator${dispute}`].lastPeriodChange).plus(BigNumber(subcourts[this.state[`arbitrator${dispute}`].subcourtID].timesPerPeriod[this.state[`arbitrator${dispute}`].period])))
                          .toNumber()}
                      />
                    </>
                  )}
                </Card.Footer>
              </Card>
            </Col>
          ))}
        </Form.Row>
      </Container>
    );
  }
}

export default openDisputeIDs;
