import { Button, Card, Col, Container, Form, Spinner } from "react-bootstrap";
import Dropzone from "react-dropzone";
import React from "react";

class QuestionDisplay extends React.Component {
  constructor(properties) {
    super(properties);
    this.state = {
      evidenceDescription: "",
      evidenceTitle: "",
      fileInput: "",
      awaitingConfirmation: false
    };
  }

  render() {
    const {
      evidenceDescription,
      evidenceTitle,
      fileInput,
      awaitingConfirmation
    } = this.state;
    return (
      <Card
        className="w-100"
        style={{
          marginLeft: 0,
          marginRight: 0
        }}
      >
        <Card.Body style={{ backgroundColor: "#F5F1FD" }}>
          <Form>
            <Form.Row>
              <Col>
                <p className="purple-inverted ">Question</p>
                <p className=" font-weight-bold purple-inverted">
                  {this.props.question}
                </p>
              </Col>
            </Form.Row>
            <Form.Row>
              <Col md={3}>
                <p className="purple-inverted">First Ruling Option</p>
                <p className=" font-weight-bold purple-inverted">
                  {this.props.firstRulingOption || "Not provided"}
                </p>
              </Col>
              <Col md={9}>
                <p className="purple-inverted">First Ruling Description</p>
                <p className="font-weight-bold purple-inverted">
                  {this.props.firstRulingDescription || "Not provided"}
                </p>
              </Col>
            </Form.Row>
            <Form.Row>
              <Col md={3}>
                <p className="purple-inverted">Second Ruling Option</p>
                <p className="font-weight-bold purple-inverted">
                  {this.props.secondRulingOption || "Not provided"}
                </p>
              </Col>
              <Col md={9}>
                <p className="purple-inverted">Second Ruling Description</p>
                <p className="font-weight-bold purple-inverted">
                  {this.props.secondRulingDescription || "Not provided"}
                </p>
              </Col>
            </Form.Row>
          </Form>
        </Card.Body>
      </Card>
    );
  }
}

export default QuestionDisplay;
