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
                <Form.Group controlId="question">
                  <Form.Label>Question</Form.Label>
                  <Form.Control
                    readOnly
                    type="text"
                    value={this.props.question}
                  />
                </Form.Group>
              </Col>
            </Form.Row>
            <Form.Row>
              <Col>
                <Form.Group>
                  <Form.Label>First Ruling Option</Form.Label>
                  <Form.Control
                    readOnly
                    type="text"
                    value={this.props.firstRulingOption}
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group>
                  <Form.Label>First Ruling Description</Form.Label>
                  <Form.Control
                    readOnly
                    type="text"
                    value={this.props.firstRulingDescription}
                  />
                </Form.Group>
              </Col>{" "}
            </Form.Row>
            <Form.Row>
              <Col>
                <Form.Group>
                  <Form.Label>Second Ruling Option</Form.Label>
                  <Form.Control
                    readOnly
                    type="text"
                    value={this.props.secondRulingOption}
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group>
                  <Form.Label>Second Ruling Description</Form.Label>

                  <Form.Control
                    readOnly
                    type="text"
                    value={this.props.secondRulingDescription}
                  />
                </Form.Group>
              </Col>{" "}
            </Form.Row>
          </Form>
        </Card.Body>
      </Card>
    );
  }
}

export default QuestionDisplay;
