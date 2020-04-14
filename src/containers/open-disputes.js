import React from "react";
import { Accordion, Container, Col, Row, Button, Form, Card, Dropdown } from "react-bootstrap";
import { ReactComponent as ScalesSVG } from "../assets/images/scales.svg";
import { Redirect, Link } from "react-router-dom";

const span = Object.freeze({ xs: 12, sm: 12, md: 6, lg: 4, xl: 3 });

class openDisputeIDs extends React.Component {
  constructor(props) {
    super(props);
    this.state = { openDisputeIDs: [] };
  }
  componentDidMount() {
    this.props.getOpenDisputesCallback().then((response) => {
      this.setState({ openDisputeIDs: response.openDisputes });
      Promise.all([response.openDisputes.map((dispute) => this.props.getMetaEvidenceCallback(dispute).then((response) => this.setState({ [dispute]: response })))]);
    });
  }
  render() {
    console.debug(this.state);

    const { openDisputeIDs, selectedDispute } = this.state;

    if (selectedDispute) return <Redirect to={`/interact/${selectedDispute}`} />;

    return (
      <Container fluid className="main-content">
        <Form.Row style={{ margin: 0 }}>
          {openDisputeIDs.map((dispute) => (
            <Col key={dispute} xl={span.xl} lg={span.lg} md={span.md} sm={span.sm} xs={span.xs}>
              <Card style={{ cursor: "pointer" }} onClick={(e) => this.setState({ selectedDispute: dispute })}>
                <Card.Header>
                  <Form.Row className="w-100">
                    <Col xs={12}>
                      <ScalesSVG style={{ height: "24px", verticalAlign: "baseline", width: "auto" }} />
                      <span style={{ float: "right" }}>#{dispute}</span>
                    </Col>
                  </Form.Row>
                </Card.Header>
                <Card.Body style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>{this.state[dispute] && this.state[dispute].metaEvidenceJSON.title}</Card.Body>
              </Card>
            </Col>
          ))}
        </Form.Row>
      </Container>
    );
  }
}

export default openDisputeIDs;
