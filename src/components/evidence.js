import { Accordion, Button, Card, Col, Container, Form } from "react-bootstrap";
import Dropzone from "react-dropzone";
import React from "react";

class Evidence extends React.Component {
  constructor(properties) {
    super(properties);
    this.state = { evidenceDescription: "", evidenceTitle: "", fileInput: "" };
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
    const { evidenceDescription, evidenceDocument, evidenceTitle } = this.state;
    await this.props.submitEvidenceCallback({
      evidenceDescription,
      evidenceDocument,
      evidenceTitle
    });
  };

  render() {
    const { evidenceDescription, evidenceTitle, fileInput } = this.state;
    return (
      <Container fluid="true">
        <Card>
          <Card.Header>
            <img alt="evidence" src="evidence.svg" />
            Submit Evidence
          </Card.Header>
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
                <Col>
                  <Form.Group>
                    <Button
                      className="float-right"
                      onClick={this.handleSubmitEvidenceButtonClick}
                      disabled={!evidenceTitle || !evidenceDescription}
                    >
                      Submit Evidence
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
