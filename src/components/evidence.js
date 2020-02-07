import { Button, Card, Col, Container, Form, Spinner } from "react-bootstrap";
import Dropzone from "react-dropzone";
import React from "react";
import { ReactComponent as EvidenceSVG } from "../assets/images/evidence.svg";

class Evidence extends React.Component {
  constructor(properties) {
    super(properties);
    this.state = {
      evidenceDescription: "",
      evidenceTitle: "",
      fileInput: "",
      awaitingConfirmation: false,
      supportingSide: 0
    };
  }

  handleControlChange = async event => {
    await this.setState({ [event.target.id]: event.target.value });
  };

  handleDrop = async acceptedFiles => {
    console.log(acceptedFiles);
    this.setState({ fileInput: acceptedFiles[0] });

    var reader = new FileReader();
    reader.readAsArrayBuffer(acceptedFiles[0]);
    reader.addEventListener("loadend", async () => {
      const buffer = Buffer.from(reader.result);

      const result = await this.props.publishCallback(
        acceptedFiles[0].name,
        buffer
      );

      console.log(result);

      await this.setState({
        evidenceDocument: `/ipfs/${result[1].hash}${result[0].path}`
      });
    });
  };

  handleSubmitEvidenceButtonClick = async event => {
    const {
      evidenceDescription,
      evidenceDocument,
      evidenceTitle,
      supportingSide
    } = this.state;
    await this.setState({
      awaitingConfirmation: true
    });
    await this.props.submitEvidenceCallback({
      evidenceDescription,
      evidenceDocument,
      evidenceTitle,
      supportingSide
    });
    await this.setState({
      awaitingConfirmation: false,
      evidenceTitle: "",
      evidenceDescription: "",
      fileInput: ""
    });
  };

  render() {
    const {
      evidenceDescription,
      evidenceTitle,
      fileInput,
      awaitingConfirmation
    } = this.state;

    console.log(this.state);
    return (
      <Container fluid="true">
        <Card>
          <Card.Header>
            <EvidenceSVG />
            Submit Evidence
          </Card.Header>
          <hr className="mt-0" />
          <Card.Body>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label>Evidence Title</Form.Label>
                    <Form.Control
                      as="input"
                      id="evidenceTitle"
                      onChange={this.handleControlChange}
                      placeholder="e.g. The photo does not comply."
                      type="text"
                      value={evidenceTitle}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label>Evidence Description</Form.Label>
                    <Form.Control
                      as="textarea"
                      id="evidenceDescription"
                      onChange={this.handleControlChange}
                      placeholder="Your arguments."
                      rows="3"
                      value={evidenceDescription}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label>Upload Evidence Document (optional)</Form.Label>
                    <Dropzone onDrop={this.handleDrop}>
                      {({ getInputProps, getRootProps }) => (
                        <section id="dropzone">
                          <div {...getRootProps()} className="vertical-center">
                            <input {...getInputProps()} />
                            <h5>
                              {(fileInput && fileInput.path) ||
                                "Drag 'n' drop some files here, or click to select files."}
                            </h5>
                          </div>
                        </section>
                      )}
                    </Dropzone>
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <div key="inline-radio" className="mb-3">
                  <Form.Check
                    name="support"
                    inline
                    defaultChecked
                    value={0}
                    label="Discussion"
                    type="radio"
                    id="supportingSide"
                    onChange={this.handleControlChange}
                  />
                  <Form.Check
                    name="support"
                    value={1}
                    inline
                    label={`I'm supporting "${
                      this.props.rulingOptions.titles[0]
                    }"`}
                    type="radio"
                    id="supportingSide"
                    onChange={this.handleControlChange}
                  />
                  <Form.Check
                    value={2}
                    name="support"
                    inline
                    label={`I'm supporting "${
                      this.props.rulingOptions.titles[1]
                    }:"`}
                    type="radio"
                    id="supportingSide"
                    onChange={this.handleControlChange}
                  />
                </div>
                <Col>
                  <Form.Group>
                    <Button
                      className="float-right ok"
                      onClick={this.handleSubmitEvidenceButtonClick}
                      disabled={
                        !evidenceTitle ||
                        !evidenceDescription ||
                        awaitingConfirmation
                      }
                    >
                      {" "}
                      {awaitingConfirmation && (
                        <Spinner
                          as="span"
                          animation="grow"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                        />
                      )}{" "}
                      {(awaitingConfirmation && "Awaiting Confirmation") ||
                        "Submit Evidence"}
                    </Button>
                  </Form.Group>
                </Col>
              </Form.Row>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    );
  }
}

export default Evidence;
